/**
 * Every error the API returns has this shape, so the client has exactly one
 * branch to write instead of guessing per endpoint.
 */
export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "WRITE_CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiFieldError {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiFieldError[];
  };
}

/** Single-resource responses are wrapped so they can grow metadata later. */
export interface ApiResource<T> {
  data: T;
}
