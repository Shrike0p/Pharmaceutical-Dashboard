import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import type { ApiErrorBody, ApiFieldError } from "@ecl/shared";
import { AppError, ConflictError, NotFoundError, WriteConflictError } from "../errors/app-error.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { logger } from "../lib/logger.ts";

function toFieldErrors(error: ZodError): ApiFieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "<root>",
    message: issue.message,
  }));
}

const snakeToCamel = (value: string): string =>
  value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

/**
 * Work out which field a unique-constraint violation was about.
 *
 * Prisma exposed this as `meta.target` before v7. With a driver adapter it now
 * arrives as the PostgreSQL constraint name instead (`equipment_code_key`), so
 * both shapes are handled — the older one first, in case a future release
 * restores it.
 */
function extractUniqueField(meta: Record<string, unknown> | undefined): string | undefined {
  const target = meta?.["target"];
  if (Array.isArray(target) && typeof target[0] === "string") return snakeToCamel(target[0]);
  if (typeof target === "string") return snakeToCamel(target);

  const cause = (meta?.["driverAdapterError"] as { cause?: Record<string, unknown> } | undefined)?.cause;
  const index = (cause?.["constraint"] as { index?: string } | undefined)?.index;
  const table = cause?.["table"];
  if (typeof index !== "string") return undefined;

  // `equipment_code_key` -> `code`
  const withoutTable = typeof table === "string" ? index.replace(new RegExp(`^${table}_`), "") : index;
  const column = withoutTable.replace(/_key$/, "");
  return column ? snakeToCamel(column) : undefined;
}

/**
 * Translate Prisma's known request errors into domain errors so the client
 * never sees a database-shaped failure.
 */
function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): AppError | undefined {
  switch (error.code) {
    case "P2002": {
      const field = extractUniqueField(error.meta);
      return new ConflictError(
        field
          ? `A record with this ${field} already exists`
          : "A record with these values already exists",
        field ? [{ path: field, message: "Already in use" }] : undefined,
      );
    }
    case "P2025":
      return new NotFoundError("Record");
    case "P2003":
      return new ConflictError("Referenced record does not exist");
    case "P2034":
      // Serialization failure or deadlock under SERIALIZABLE isolation.
      return new WriteConflictError();
    default:
      return undefined;
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: { code: "NOT_FOUND", message: `Cannot ${req.method} ${req.originalUrl}` },
  };
  res.status(404).json(body);
};

/**
 * The single place an error becomes an HTTP response.
 *
 * Express 5 forwards rejected promises from async handlers here automatically,
 * which is why no route in this codebase wraps itself in try/catch.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    // A Zod error escaping a service (rather than the validate middleware)
    // still describes a bad request, not a server fault.
    appError = new AppError(400, "VALIDATION_ERROR", "Request validation failed", toFieldErrors(error));
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    appError = fromPrismaError(error) ?? new AppError(500, "INTERNAL_ERROR", "Unexpected database error");
  } else {
    appError = new AppError(500, "INTERNAL_ERROR", "Something went wrong");
  }

  if (appError.status >= 500) {
    // Log the real cause; return only the sanitised message.
    logger.error({ err: error }, "Unhandled error");
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
  };

  res.status(appError.status).json(body);
};
