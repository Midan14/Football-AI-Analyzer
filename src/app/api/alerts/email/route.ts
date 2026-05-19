import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";

/**
 * POST /api/alerts/email
 * Send email alert when value bet detected
 * Requires RESEND_API_KEY in env
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const body = await request.json();
  const { to, subject, html } = body;

  // If no Resend API key, just log the alert
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log("[EMAIL ALERT - NO RESEND KEY]", { to, subject });
    return successResponse({
      sent: false,
      reason: "RESEND_API_KEY not configured",
      logged: true,
    });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Football AI <noreply@example.com>",
        to,
        subject,
        html,
      }),
    });

    if (!res.ok) throw new Error("Resend API error");
    const data = await res.json();

    return successResponse({ sent: true, id: data.id });
  } catch (error) {
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
