import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getActiveAlerts } from "@/backend/server/football/alerts-service";
import { checkRateLimit } from "@/lib/rate-limit";
import { errorResponse, Errors } from "@/lib/api-utils";
import { captureException } from "@/lib/sentry";

/**
 * GET /api/alerts/stream
 * Server-Sent Events (SSE) endpoint for real-time alerts.
 * Connects and streams alert events as they occur.
 * 
 * Usage: const eventSource = new EventSource('/api/alerts/stream');
 * eventSource.onmessage = (e) => console.log(JSON.parse(e.data));
 */
export const GET = async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "alerts:stream", 20, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas conexiones de alertas." }, 429);
  }

  const encoder = new TextEncoder();
  const userId = session.user.id;
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`)
      );

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:ping\n\n`));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30000);

      const sendActiveAlerts = async () => {
        try {
          const alerts = await getActiveAlerts(userId);
          for (const alert of alerts) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "alert", alert, timestamp: new Date().toISOString() })}\n\n`)
            );
          }
        } catch (error) {
          captureException(error, { op: "alerts-stream" });
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ message: "No se pudieron evaluar las alertas." })}\n\n`)
          );
        }
      };

      void sendActiveAlerts();

      const alertInterval = setInterval(() => {
        void sendActiveAlerts().catch(() => {
          clearInterval(alertInterval);
          clearInterval(pingInterval);
        });
      }, 60000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        clearInterval(alertInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
};

export const dynamic = "force-dynamic";
