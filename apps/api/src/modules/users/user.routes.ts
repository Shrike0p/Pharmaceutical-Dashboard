import { Router } from "express";
import {
  createUserSchema,
  updateUserSchema,
  userListQuerySchema,
  type CreateUserInput,
  type UpdateUserInput,
  type UserListQuery,
} from "@ecl/shared";
import { authenticate, requireRole, requireUser } from "../../middleware/authenticate.ts";
import { body, param, query, validateBody, validateQuery } from "../../middleware/validate.ts";
import { createUser, listUsersAdmin, updateUser } from "./user.service.ts";

/**
 * Account management, mounted at `/api/users`. Every route here is
 * supervisor-only - this is provisioning, not the lightweight staff picker
 * at `/api/auth/users` that any signed-in user can read.
 */
export const userRouter: Router = Router();

userRouter.use(authenticate, requireRole("SUPERVISOR"));

userRouter.get("/", validateQuery(userListQuerySchema), async (req, res) => {
  res.status(200).json(await listUsersAdmin(query<UserListQuery>(req)));
});

userRouter.post("/", validateBody(createUserSchema), async (req, res) => {
  res.status(201).json({ data: await createUser(body<CreateUserInput>(req)) });
});

userRouter.patch("/:userId", validateBody(updateUserSchema), async (req, res) => {
  const updated = await updateUser(param(req, "userId"), body<UpdateUserInput>(req), requireUser(req));
  res.status(200).json({ data: updated });
});
