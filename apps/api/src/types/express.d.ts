import type { UserSummaryDto } from "@ecl/shared";

/**
 * Request augmentations, declared once for the whole app.
 *
 * `user` is populated only by the `authenticate` middleware and `validated*`
 * only by the `validate` middleware, so a handler reading either is guaranteed
 * to be looking at server-derived data rather than at the raw request.
 */
declare global {
  namespace Express {
    interface Request {
      user?: UserSummaryDto;
      validatedBody?: unknown;
      validatedQuery?: unknown;
    }
  }
}

export {};
