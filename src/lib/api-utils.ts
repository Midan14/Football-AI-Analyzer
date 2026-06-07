import { NextRequest, NextResponse } from "next/server";
import { captureException, addBreadcrumb } from "./sentry";

/**
 * Custom error class for API responses
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "UNKNOWN_ERROR",
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Standard API response format
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    version: string;
  };
}

function isErrorEnvelope(error: unknown): error is { code?: string; message?: string; details?: unknown } {
  return typeof error === "object" && error !== null && ("code" in error || "message" in error);
}

/**
 * Create success response
 */
export function successResponse<T>(data: T, statusCode: number = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        version: "1.0",
      },
    },
    { status: statusCode }
  );
}

/**
 * Create error response
 */
export function errorResponse(
  error: Error | ApiError | string | unknown,
  statusCode: number = 500
): NextResponse<ApiResponse> {
  let code = "INTERNAL_SERVER_ERROR";
  let message = "An error occurred";
  let details: unknown = undefined;
  if (error instanceof ApiError) {
    code = error.code;
    message = error.message;
    statusCode = error.statusCode;
    details = error.details;
  } else if (error instanceof Error) {
    code = "INTERNAL_SERVER_ERROR";
    message = error.message;
  } else if (typeof error === "string") {
    code = "INTERNAL_SERVER_ERROR";
    message = error;
  } else if (isErrorEnvelope(error)) {
    code = error.code ?? code;
    message = error.message ?? message;
    details = error.details;
  } else if (error) {
    code = "INTERNAL_SERVER_ERROR";
    message = String(error);
  }

  // Log to Sentry
  captureException(error instanceof Error ? error : new Error(message), {
    statusCode,
    code,
  });

  addBreadcrumb(`API Error: ${code}`, "api", "error");

  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details: details ?? (process.env.NODE_ENV === "development" ? message : undefined),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: "1.0",
      },
    },
    { status: statusCode }
  );
}

/**
 * Wrap async route handlers with error handling
 */
export function withErrorHandling(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: any) => {
    try {
      addBreadcrumb(`${req.method} ${req.nextUrl.pathname}`, "api", "info");
      return await handler(req, context);
    } catch (error) {
      if (error instanceof ApiError) {
        return errorResponse(error, error.statusCode);
      }
      return errorResponse(error instanceof Error ? error : new Error(String(error)), 500);
    }
  };
}

/**
 * Common HTTP errors
 */
export const Errors = {
  UNAUTHORIZED: new ApiError(401, "Unauthorized", "UNAUTHORIZED"),
  FORBIDDEN: new ApiError(403, "Forbidden", "FORBIDDEN"),
  NOT_FOUND: new ApiError(404, "Not found", "NOT_FOUND"),
  BAD_REQUEST: (message: string = "Bad request") =>
    new ApiError(400, message, "BAD_REQUEST"),
  VALIDATION_ERROR: (details: unknown) =>
    new ApiError(400, "Validation failed", "VALIDATION_ERROR", details),
  INTERNAL_SERVER_ERROR: new ApiError(500, "Internal server error", "INTERNAL_SERVER_ERROR"),
  SERVICE_UNAVAILABLE: new ApiError(503, "Service unavailable", "SERVICE_UNAVAILABLE"),
  BAD_GATEWAY: (message: string = "Bad gateway") =>
    new ApiError(502, message, "BAD_GATEWAY"),
  GATEWAY_TIMEOUT: (message: string = "Gateway timeout") =>
    new ApiError(504, message, "GATEWAY_TIMEOUT"),
};
