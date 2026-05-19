import { NextRequest } from "next/server";

/**
 * GET /api/alerts/stream
 * Server-Sent Events (SSE) endpoint for real-time alerts.
 * Connects and streams alert events as they occur.
 * 
 * Usage: const eventSource = new EventSource('/api/alerts/stream');
 * eventSource.onmessage = (e) => console.log(JSON.parse(e.data));
 */
export const GET = async (request: NextRequest) => {
  const encoder = new TextEncoder();
  
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

      // Simulate alert events every 60 seconds (replace with real alert detection)
      const alertInterval = setInterval(() => {
        try {
          const mockAlert = {
            type: "VALUE_DETECTED",
            fixtureId: `mock-${Date.now()}`,
            market: "Over 2.5",
            edge: Math.round(Math.random() * 10 + 2),
            confidence: Math.round(Math.random() * 30 + 60),
            timestamp: new Date().toISOString(),
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(mockAlert)}\n\n`)
          );
        } catch {
          clearInterval(alertInterval);
          clearInterval(pingInterval);
        }
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
