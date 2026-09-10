import type { ApiErrorBody, ApiErrorCode, ApiFieldError } from "@ecl/shared";

const BASE_URL = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:4000";

const TOKEN_STORAGE_KEY = "ecl.token";

/**
 * A typed error carrying everything the UI needs to react: the machine-readable
 * code for branching, the message for display, and per-field details so a form
 * can highlight the offending input rather than showing a banner.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: ApiFieldError[];

  constructor(status: number, code: ApiErrorCode, message: string, details: ApiFieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      // Private browsing or blocked storage — degrade to an in-memory session.
      return null;
    }
  },
  set: (token: string): void => {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear: (): void => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  const token = tokenStore.get();

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();

  // Not every non-2xx response comes from this API in this API's shape — a
  // proxy 502 or a dev-server HTML error page would make a bare `JSON.parse`
  // throw `SyntaxError: Unexpected token '<'`, which then surfaces to the user
  // as that literal string instead of a real message.
  let payload: unknown;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new ApiError(
          response.status,
          "INTERNAL_ERROR",
          `The server returned an unexpected response (status ${response.status}).`,
          [],
        );
      }
      throw new ApiError(response.status, "INTERNAL_ERROR", "The server returned malformed JSON.", []);
    }
  }

  if (!response.ok) {
    const error = (payload as ApiErrorBody | undefined)?.error;

    // A rejected token means the session is over. Clearing it here — at the
    // one place every request funnels through — is what stops an expired
    // session from turning every page into a permanent error state that no
    // amount of retrying or navigating can escape.
    if (response.status === 401 && tokenStore.get()) {
      tokenStore.clear();
      onUnauthorized?.();
    }

    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details ?? [],
    );
  }

  return payload as T;
}

/**
 * Set once by the auth provider. A module-level hook rather than an import of
 * the auth module, which would be a cycle: auth imports this file.
 */
let onUnauthorized: (() => void) | undefined;

export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  onUnauthorized = handler;
}

/** Builds a query string, omitting undefined and empty values. */
export function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
