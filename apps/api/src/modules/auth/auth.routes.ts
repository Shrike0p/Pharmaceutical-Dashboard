import { Router } from "express";
import { loginSchema, type LoginInput } from "@ecl/shared";
import { authenticate, requireUser } from "../../middleware/authenticate.ts";
import { body, validateBody } from "../../middleware/validate.ts";
import { listUsers, login } from "./auth.service.ts";

export const authRouter: Router = Router();

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const result = await login(body<LoginInput>(req));
  res.status(200).json(result);
});

authRouter.get("/me", authenticate, (req, res) => {
  res.status(200).json({ data: requireUser(req) });
});

/**
 * Used by the cleaning-record form to populate the "cleaned by" picker.
 * Authenticated because the staff directory is not public, but not
 * role-restricted — every signed-in user needs it to file a record.
 */
authRouter.get("/users", authenticate, async (_req, res) => {
  res.status(200).json({ data: await listUsers() });
});
