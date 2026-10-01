/**
 * The single place a response is shaped.
 *
 * Two rules this module exists to enforce:
 *
 * 1. **Consistent envelope.** Every endpoint answers `{ success, data }` or
 *    `{ success, error }`, so a client never has to guess the shape.
 * 2. **No leakage.** Unknown errors become a generic message. Stack traces, Mongoose
 *    `ValidationError` output and MongoDB driver errors are logged server-side and never
 *    serialised into a response body (docs/security.md section 10).
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { log } from "@/server/log";

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ASSIGNMENT_CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: FieldError[];

  constructor(
    code: ApiErrorCode,
    status: number,
    message: string,
    details?: FieldError[],
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static badRequest(message: string, details?: FieldError[]) {
    return new ApiError("BAD_REQUEST", 400, message, details);
  }

  static unauthenticated(message = "Authentication required") {
    return new ApiError("UNAUTHENTICATED", 401, message);
  }

  /**
   * 403 — the record is genuinely visible to this caller, but the action is not permitted
   * (e.g. a `client_viewer` attempting to cancel an assignment).
   *
   * 404 is used for "not yours"; see `notFound`.
   */
  static forbidden(
    message = "You do not have permission to perform this action",
  ) {
    return new ApiError("FORBIDDEN", 403, message);
  }

  /**
   * 404 — deliberately covers both "does not exist" and "outside your tenant".
   *
   * Returning 403 for a record that belongs to another tenant would confirm it exists, giving
   * a free enumeration oracle for client, site, guard and station ids. Making the two
   * indistinguishable is the control.
   */
  static notFound(message = "Resource not found") {
    return new ApiError("NOT_FOUND", 404, message);
  }

  static conflict(code: ApiErrorCode, message: string, details?: FieldError[]) {
    return new ApiError(code, 409, message, details);
  }

  static rateLimited(message = "Too many requests. Please try again shortly.") {
    return new ApiError("RATE_LIMITED", 429, message);
  }
}

export type FieldError = { path: string; message: string };

function zodToFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "body",
    message: issue.message,
  }));
}

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

export type ApiSuccess<T> = {
  success: true;
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
};

export function apiSuccess<T>(
  data: T,
  options: { message?: string; meta?: Record<string, unknown> } = {},
): ApiSuccess<T> {
  return { success: true, data, ...options };
}

export function apiOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(apiSuccess(data), init);
}

export function apiCreated<T>(data: T, message = "Created") {
  return NextResponse.json(apiSuccess(data, { message }), { status: 201 });
}

// ---------------------------------------------------------------------------
// Failure
// ---------------------------------------------------------------------------

export type ApiFailure = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: FieldError[];
  };
  message: string;
};

export function apiFailure(error: ApiError): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      message: "Request failed",
    },
    { status: error.status },
  );
}

/**
 * Maps any thrown value to a response.
 *
 * Known error types keep their message because the message was authored for the user. Anything
 * else is logged in full and answered with a generic message — the boundary that stops a driver
 * error from becoming a data-exfiltration channel.
 */
export function apiError(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ApiError) {
    return apiFailure(error);
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR" satisfies ApiErrorCode,
          message: "The submitted data is invalid",
          details: zodToFieldErrors(error),
        },
        message: "Request failed",
      },
      { status: 422 },
    );
  }

  log.error("Unhandled error in API route", error);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR" satisfies ApiErrorCode,
        message: "An unexpected error occurred",
      },
      message: "Request failed",
    },
    { status: 500 },
  );
}

/** Wraps a handler so an unexpected throw still produces the envelope. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return apiError(error);
    }
  };
}
