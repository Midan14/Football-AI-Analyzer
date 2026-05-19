import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ResetPasswordSchema } from "@/lib/schemas/auth";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { addBreadcrumb, captureException } from "@/lib/sentry";

/**
 * POST /api/auth/reset
 * Consume a reset token and set a new password.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const validation = ResetPasswordSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const { token, password } = validation.data;
  const hashedToken = createHash("sha256").update(token).digest("hex");

  const user = await prisma.user.findFirst({
    where: {
      resetToken: hashedToken,
      resetTokenExpiry: { gt: new Date() },
      status: "ACTIVE",
    },
  });

  if (!user) {
    addBreadcrumb("Reset attempted with invalid/expired token", "auth", "warning");
    return errorResponse(Errors.BAD_REQUEST("Token inválido o expirado"), 400);
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
        },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({
        data: { userId: user.id, action: "PASSWORD_RESET", resource: "AUTH" },
      }),
    ]);

    addBreadcrumb(`Password reset for user ${user.id}`, "auth", "info");
    return successResponse({ ok: true });
  } catch (err) {
    captureException(err, { action: "reset_password", userId: user.id });
    return errorResponse(Errors.INTERNAL_SERVER_ERROR);
  }
});
