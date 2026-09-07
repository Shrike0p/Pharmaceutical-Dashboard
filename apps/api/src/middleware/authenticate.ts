import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { Role, UserSummaryDto } from "@ecl/shared";
import { env } from "../config/env.ts";
import { ForbiddenError, UnauthorizedError } from "../errors/app-error.ts";

// `Request.user` is declared in src/types/express.d.ts. It is populated only
// here, never from a request body — this is the value the audit trail records
// as the actor.

interface JwtPayload {
  sub: string;
  name: string;
  email: string;
  role: Role;
}

export function signAccessToken(user: UserSummaryDto): string {
  const payload: Omit<JwtPayload, "sub"> = {
    name: user.name,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}

/**
 * Rejects the request unless it carries a valid, unexpired bearer token.
 *
 * The identity is reconstructed from the token's claims rather than re-read
 * from the database on every request. That is the usual stateless-JWT
 * trade-off: it costs a query per request to do otherwise, at the price of a
 * role change not taking effect until the token expires. With an 8-hour token
 * that is acceptable here; see NOTES.md.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    next(new UnauthorizedError("Missing bearer token"));
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: decoded.sub,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (error) {
    const message =
      error instanceof jwt.TokenExpiredError ? "Session expired, please sign in again" : "Invalid token";
    next(new UnauthorizedError(message));
  }
};

/** Guards a route behind one or more roles. Must run after `authenticate`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(
        new ForbiddenError(
          `This action requires the ${roles.join(" or ")} role; you are signed in as ${req.user.role}`,
        ),
      );
      return;
    }
    next();
  };
}

/** Narrowing helper for handlers that run behind `authenticate`. */
export function requireUser(req: Request): UserSummaryDto {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
