import { randomBytes, createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ForgotPasswordSchema } from "@/lib/schemas/auth";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { addBreadcrumb, captureException } from "@/lib/sentry";
import { sendEmail, buildPasswordResetEmail } from "@/lib/email";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/auth/forgot
 * Request a password-reset token. Always returns success to avoid leaking
 * whether an email exists in the system.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const validation = ForgotPasswordSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const { email } = validation.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.status === "ACTIVE") {
    try {
      const rawToken = randomBytes(32).toString("hex");
      const hashedToken = createHash("sha256").update(rawToken).digest("hex");

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: hashedToken,
          resetTokenExpiry: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });

      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const resetUrl = `${baseUrl}/auth/reset/${rawToken}`;

      addBreadcrumb(`Password reset requested for ${email}`, "auth", "info");

      // Send email via configured provider (Resend / SendGrid / SMTP / console)
      const emailTemplate = buildPasswordResetEmail(resetUrl);
      const result = await sendEmail({ to: email, ...emailTemplate });

      if (!result.ok) {
        captureException(new Error(result.error), { action: "send_reset_email", email });
        // Still log in dev as fallback
        if (process.env.NODE_ENV !== "production") {
          console.info(`[auth] reset link (email failed): ${resetUrl}`);
        }
      }
    } catch (err) {
      captureException(err, { action: "forgot_password", email });
    }
  }

  return successResponse({ ok: true });
});
