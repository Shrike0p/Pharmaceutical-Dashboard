import type { Request, RequestHandler } from "express";
import type { ZodError, ZodType } from "zod";
import { NotFoundError, ValidationError } from "../errors/app-error.ts";

function formatIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "<root>",
    message: issue.message,
  }));
}

/**
 * Validates `req.body` and stores the *parsed* result on `req.validatedBody`.
 *
 * The parsed value is kept separate from `req.body` deliberately: a handler
 * reading `validatedBody` is guaranteed to be looking at data that passed the
 * schema, so there is no way to accidentally trust the raw payload.
 */
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError("Request body is invalid", formatIssues(result.error)));
      return;
    }
    req.validatedBody = result.data;
    next();
  };
}

/**
 * Validates `req.query`. Express 5 exposes `query` as a getter-only property,
 * so the parsed result goes on `req.validatedQuery` rather than being assigned
 * back over the original.
 */
export function validateQuery(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError("Query parameters are invalid", formatIssues(result.error)));
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}

/** Typed accessors, so controllers do not repeat the cast. */
export function body<T>(req: Request): T {
  return req.validatedBody as T;
}

export function query<T>(req: Request): T {
  return req.validatedQuery as T;
}

/**
 * Reads a required route parameter.
 *
 * Express types path params as possibly absent, which under
 * `noUncheckedIndexedAccess` is correct: a router mounted without `mergeParams`
 * really would not see its parent's params. Failing loudly here beats
 * scattering non-null assertions through the controllers.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new NotFoundError(`Route parameter '${name}'`);
  }
  return value;
}
