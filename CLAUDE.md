# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Equipment Cleaning Log for pharmaceutical manufacturing: equipment is cleaned between production
runs, each cleaning is recorded and verified, and **every create and update is captured in a
field-level audit trail**. Built as a take-home; the audit trail's correctness is the point of the
exercise, not incidental to it.

pnpm workspace, three packages:

```
apps/api          Express 5 + Prisma 7 + PostgreSQL 17
apps/web          React 19 + Vite + TanStack Query + Tailwind 4
packages/shared   Zod schemas + DTO types, imported by BOTH apps
```

`README.md` covers setup and the API surface. `NOTES.md` records the design decisions and
trade-offs — **read it before changing anything in the audit or pagination paths**, as most of what
looks arbitrary there is deliberate and argued.

## Commands

Run from the repository root.

```bash
nvm use              # Node 24 — mandatory, see below
pnpm install         # postinstall runs `prisma generate`
pnpm dev             # API on :4000, web on :5173
pnpm test            # 51 tests (unit + integration)
pnpm test:unit       # no database, ~150ms
pnpm test:integration
pnpm typecheck       # tsc --noEmit across all three packages
pnpm lint            # one ESLint flat config at the root covers the workspace
pnpm build
pnpm db:migrate      # migrate dev + generate
pnpm db:seed         # truncates, then reseeds
pnpm db:reset        # drop, re-migrate, reseed
```

Single test file or single test:

```bash
cd apps/api
pnpm exec vitest run test/unit/audit-diff.test.ts
pnpm exec vitest run --project integration -t "no audit entry when the update changes nothing"
pnpm exec vitest            # watch mode
```

## Environment gotchas

- **Node 24 is required.** Prisma 7 refuses Node 23 and other odd-numbered releases with a confusing
  preinstall failure. `.nvmrc` pins it.
- **One `.env` at the repository root**, shared by both apps. `apps/api/src/config/env.ts` walks
  upward to find it and validates it with Zod at boot, so a missing/short `JWT_SECRET` fails
  immediately rather than at first login. Vite reads it via `envDir` in `apps/web/vite.config.ts`.
- Integration tests set `NODE_ENV=test`, which makes `config/env.ts` select `TEST_DATABASE_URL`.
  That indirection is what stops a test run from truncating the development database.

## Prisma 7 specifics

These differ from Prisma 6 and have already caused real bugs here:

- **No `url` in the schema datasource.** The connection string lives in `apps/api/prisma.config.ts`
  for Migrate; the runtime client connects through `@prisma/adapter-pg` (`src/lib/prisma.ts`).
- **`.env` is not auto-loaded** — `prisma.config.ts` loads it explicitly with dotenv.
- **`migrate dev` does not generate the client** and **`migrate reset` does not run the seed**. Both
  exit cleanly while leaving you broken, so the scripts chain `prisma generate` / `prisma db seed`
  explicitly. Do not "simplify" those scripts back.
- **Pin `prisma` to `7.10.0`.** Its npm `latest` tag currently resolves to an `8.0.0-rc` while
  `@prisma/client@latest` is `7.10.0`; an unpinned install produces a mismatched CLI/client pair.
- The generated client lands in `apps/api/src/generated/prisma/` and is **gitignored** (build
  output). It emits imports carrying explicit `.ts` extensions, which is why the API's tsconfig sets
  `allowImportingTsExtensions`.
- `P2002` metadata changed: with a driver adapter the old `meta.target` is gone and the PostgreSQL
  constraint name arrives instead. `src/middleware/error-handler.ts` handles both shapes.

## Audit trail — the invariants

`apps/api/src/domain/audit/diff.ts` is a **pure function** (no Prisma, no Express, no clock) and is
the heart of the project. `apps/api/src/modules/cleaning-records/cleaning-record.service.ts`
(`updateCleaningRecord`) is where it is applied. Any change in this area must preserve all of these,
each of which is covered by a test:

1. **Only changed fields are recorded.** Resending an unchanged field must not produce an entry for
   it.
2. **An empty change set writes no audit row.** A no-op save adds nothing to the trail.
3. **`undefined` ≠ `null`.** On a PATCH, an absent key means "leave alone"; an explicit `null` means
   "clear". Conflating them lets an empty body wipe a record.
4. **Dates compare by value, not identity.** Two `Date` objects for the same instant are `!==`.
5. **`AUDITED_CLEANING_RECORD_FIELDS` is an allow-list**, not "every key on the object" — it keeps
   bookkeeping columns out and stops arbitrary keys being smuggled in via the request body.
6. **Record + audit entry are one transaction, at `SERIALIZABLE`.** The read of the prior state
   happens *inside* it: under `READ COMMITTED` two concurrent PATCHes would each read the same
   `before` and write entries claiming the same old value, silently. Postgres aborts one instead;
   `P2034` maps to `409 WRITE_CONFLICT`.
7. **The actor is always `req.user` from the verified JWT**, never the request body. Note this is a
   different person from `cleanedById` (who physically performed the cleaning) — do not merge them.
8. **`audit_logs` is append-only**, enforced by a trigger in
   `prisma/migrations/*_audit_log_immutability/`. Tests and the seed reset via `TRUNCATE`, which
   does not fire row-level triggers.

## Pagination

Both modes live on the cleaning-records list endpoint; offset is the default because the UI needs
`totalPages`.

- Ordering is `(cleanedAt DESC, id DESC)`. The `id` tie-breaker is **required** — timestamps collide,
  and without a total order keyset drops rows. This is also why Prisma's built-in `cursor` option is
  not used: it seeks on a single unique column.
- The keyset seek is expressed as `OR: [{ cleanedAt: { lt } }, { cleanedAt, id: { lt } }]`, Prisma's
  form of the row-value comparison. The composite index in `schema.prisma` exists to serve it.
- `limit` is clamped to 100 rather than rejected.
- `test/integration/pagination.test.ts` contains a paired test proving offset drifts and keyset does
  not when a row is inserted mid-iteration. Keep it.

## Conventions

- **Layering: `routes → middleware → service → prisma`.** Express `req`/`res` types never enter a
  service; services take plain arguments and return plain data. This is what makes the audit and
  pagination logic testable without HTTP.
- **Relative-import extensions differ by package** — the API writes `.ts` (required by the generated
  Prisma client's own style and `allowImportingTsExtensions`); `packages/shared` and `apps/web` are
  extensionless (`moduleResolution: "bundler"`). Match the file you are editing.
- `packages/shared` is **source-only**: its `exports` points at `./src/index.ts`, so there is no
  build step and no watcher. Both apps consume the TypeScript directly.
- Validated input goes on `req.validatedBody` / `req.validatedQuery`, never back onto `req.body` or
  `req.query` (Express 5 makes `query` getter-only). Read them via the `body<T>()` / `query<T>()`
  helpers in `src/middleware/validate.ts`.
- Route params go through `param(req, "name")` — `noUncheckedIndexedAccess` is on workspace-wide, so
  this fails loudly instead of scattering non-null assertions.
- Express 5 forwards rejected promises to the error handler automatically. **Do not add `try/catch`
  wrappers or `express-async-handler` to routes.**
- `buildApp()` in `src/app.ts` returns the app without listening, so supertest drives it in-process;
  `src/server.ts` owns `listen()` and graceful shutdown.
- All errors leave through `src/middleware/error-handler.ts` in one shape
  (`{ error: { code, message, details? } }`). Add new failure modes as `AppError` subclasses in
  `src/errors/app-error.ts` rather than returning ad-hoc JSON.
- Zod schemas live in `packages/shared` and are used by **both** the API's validate middleware and
  the web app's `zodResolver`. Adding a field means editing the schema there, not in two places.

## Testing

Vitest with two projects (`apps/api/vitest.config.ts`):

- **unit** — no database. The diff engine and cursor encoding.
- **integration** — supertest against a **real** `equipment_cleaning_log_test` database, not a
  mocked Prisma client, because transaction rollback, the immutability trigger and keyset ordering
  only exist in the database. `globalSetup` applies migrations once; `setupFiles` truncates every
  table before each test; `fileParallelism` is off because the database is shared.

There are currently **no front-end tests** — a documented, deliberate gap (see NOTES.md).

## Domain rules worth knowing before "fixing" them

- A cleaning record always starts `PENDING`; a client-supplied `status` on create is ignored.
- Only a `SUPERVISOR` can move `PENDING → VERIFIED`, and never on a record where they are the
  `cleanedById` (segregation of duties).
- Amending an already-`VERIFIED` record requires a `reason`, stored on the audit entry.
- `DELETE /api/equipment/:id` returns `409` when cleaning history exists, pointing at retiring
  instead; `onDelete: Restrict` enforces the same thing at the database level.
- There is deliberately **no signup route** — accounts are provisioned via the seed, because
  self-registration would undermine the traceability the audit trail exists to provide.
