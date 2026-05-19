import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { RegisterSchema } from "@/lib/schemas/auth";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { captureException, addBreadcrumb } from "@/lib/sentry";
import { sendEmail, buildWelcomeEmail } from "@/lib/email";

/**
 * POST /api/auth/register
 * Register a new user
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json();

  // Validate input
  const validation = RegisterSchema.safeParse(body);
  if (!validation.success) {
    addBreadcrumb("Register validation failed", "auth", "error");
    return errorResponse(
      Errors.VALIDATION_ERROR(validation.error.flatten()),
      400
    );
  }

  const { email, password, name } = validation.data;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    addBreadcrumb(`Register attempt with existing email: ${email}`, "auth", "warning");
    return errorResponse(
      Errors.BAD_REQUEST("Email already registered"),
      400
    );
  }

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: "USER",
        status: "ACTIVE",
      },
    });

    // Log registration
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "REGISTER",
        resource: "USER",
      },
    });

    addBreadcrumb(`User registered: ${email}`, "auth", "info");

    // Send welcome email (non-blocking — don't fail registration if email fails)
    const welcomeTemplate = buildWelcomeEmail(name);
    sendEmail({ to: email, ...welcomeTemplate }).catch((err) => {
      captureException(err, { action: "welcome_email", email });
    });

    return successResponse(
      {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      201
    );
  } catch (error) {
    captureException(error, { email });
    return errorResponse(Errors.INTERNAL_SERVER_ERROR);
  }
});
