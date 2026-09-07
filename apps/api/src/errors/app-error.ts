import type { ApiErrorCode, ApiFieldError } from "@ecl/shared";

/**
 * Every error the API deliberately produces is an AppError. The error handler
 * translates these into the single response shape defined in @ecl/shared;
 * anything that is *not* an AppError is treated as a bug and becomes a 500 with
 * its details withheld from the client.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: ApiFieldError[] | undefined;

  constructor(status: number, code: ApiErrorCode, message: string, details?: ApiFieldError[]) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Request validation failed", details?: ApiFieldError[]) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, "NOT_FOUND", id ? `${resource} '${id}' was not found` : `${resource} was not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: ApiFieldError[]) {
    super(409, "CONFLICT", message, details);
  }
}

/**
 * Raised when PostgreSQL aborts a SERIALIZABLE transaction because another
 * transaction touched the same row concurrently. It is not a client mistake —
 * the same request will usually succeed on retry — so it is reported
 * distinctly from an ordinary CONFLICT.
 */
export class WriteConflictError extends AppError {
  constructor(message = "The record was modified concurrently. Please retry.") {
    super(409, "WRITE_CONFLICT", message);
  }
}
