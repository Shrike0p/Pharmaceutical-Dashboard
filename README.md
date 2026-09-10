# Equipment Cleaning Log

A small full-stack slice of a pharmaceutical manufacturing system: equipment is cleaned between
production runs, each cleaning is recorded and verified, and **every create and update is captured in
a field-level audit trail** — who changed what, when, and from which value to which.

- **API** — Node.js 24 · TypeScript · Express 5 · Prisma 7 · PostgreSQL 17
- **Web** — React 19 · TypeScript · Vite · TanStack Query · React Hook Form · shadcn/ui on Tailwind CSS 4
- **Landing page** — a public marketing page with a scroll-driven 3D card (Three.js), on its own
  bundle chunk so the authenticated app never downloads it
- **Shared** — one package of Zod schemas imported by *both* sides, so the request contract cannot
  drift between client and server
- **Tests** — Vitest, 77 tests (backend only; see NOTES.md for the front-end test gap)

Design decisions and trade-offs are in **[NOTES.md](./NOTES.md)**.

---

## Live demo

> **TODO before submitting — replace both URLs and delete this line.**

| | |
|---|---|
| **App** | https://REPLACE-ME.vercel.app |
| **API health** | https://REPLACE-ME.onrender.com/api/health |

Sign in with any of the [demo accounts](#sign-in-credentials) — the sign-in page lists all three and
fills the form when you click one. Start as **Supervisor** (`priya.nair@example.com`) for the full
picture: only a supervisor can verify a record or provision an account.

**The API is on a free instance that sleeps when idle, so the first sign-in can take up to a minute
while it wakes.** Everything after that is fast. The landing page is static and always loads
immediately, so a slow sign-in is the API waking rather than the app being broken.

---

## Contents

- [Live demo](#live-demo)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Sign-in credentials](#sign-in-credentials)
- [API reference](#api-reference)
- [How the audit trail works](#how-the-audit-trail-works)
- [Pagination](#pagination)
- [Tests](#tests)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Scripts](#scripts)

---

## Architecture

```
                    Browser
                       │
       React 19 + TypeScript (Vite, port 5173)
       TanStack Query · React Hook Form + Zod
                       │
                       │  REST + JWT bearer token
                       ▼
       Express 5 + TypeScript (port 4000)
                       │
   routes → middleware → controller → service → Prisma
       (auth, validate)          (business rules,
                                  audit diff, transactions)
                       │
                       ▼
              PostgreSQL 17 (port 5432)
        users · equipment · cleaning_records · audit_logs
                       │
              audit_logs is append-only,
              enforced by a database trigger
```

Both apps and the shared contract package live in one pnpm workspace:

```
apps/api  ──┐
apps/web  ──┼──> packages/shared  (Zod schemas + DTO types)
            ┘
```

**Layering rule:** Express `req`/`res` never reach a service. Services take plain arguments and
return plain data, which is what makes the audit and pagination logic testable without HTTP.

---

## Quick start

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **24 LTS** | `.nvmrc` is committed — run `nvm use`. Prisma 7 rejects Node 23 and other odd-numbered releases. |
| pnpm | 10+ | `corepack enable` |
| PostgreSQL | 17 | Or use the Docker path below |

### Option A — Docker Compose (one command)

```bash
docker compose up --build
```

Brings up PostgreSQL, runs the migrations, seeds the database, and serves the API on
`http://localhost:4000` and the web app on `http://localhost:5173`.

> **Honest caveat:** the Compose stack and both Dockerfiles are committed, but Docker was not
> available on the machine this was built on, so this path is written from the same commands as
> Option B rather than executed. **Option B is the tested path.**

### Option B — Local PostgreSQL (tested)

```bash
# 1. Node and dependencies
nvm use                 # Node 24, per .nvmrc
corepack enable
pnpm install

# 2. PostgreSQL (macOS / Homebrew shown; any local PostgreSQL 17 works)
brew install postgresql@17
brew services start postgresql@17
createdb equipment_cleaning_log
createdb equipment_cleaning_log_test      # used by the integration tests

# 3. Environment
cp .env.example .env
#    The defaults assume a `postgres` role. If your local PostgreSQL uses your
#    own username instead, either edit DATABASE_URL in .env, or create the role:
#      psql -d postgres -c "CREATE ROLE postgres LOGIN SUPERUSER PASSWORD 'postgres';"
#      psql -d postgres -c "ALTER DATABASE equipment_cleaning_log OWNER TO postgres;"
#      psql -d postgres -c "ALTER DATABASE equipment_cleaning_log_test OWNER TO postgres;"

# 4. Schema and sample data
pnpm db:migrate         # applies migrations and generates the Prisma client
pnpm db:seed            # 4 users, 6 assets, ~70 records with audit history

# 5. Run both apps
pnpm dev                # API on :4000, web on :5173
```

Open **http://localhost:5173**.

There is one `.env` at the repository root; both apps read it. `apps/api/src/config/env.ts`
validates it with Zod at boot, so a missing or too-short `JWT_SECRET` fails immediately with a clear
message instead of at the first login.

---

## Sign-in credentials

Seeded by `pnpm db:seed`. Password for all accounts: **`Password123!`**
(The sign-in page lists them too, and clicking one fills the form.)

| Role | Email | Can do |
|---|---|---|
| Operator | `rahul.verma@example.com` | Record cleanings, amend records |
| Operator | `amit.shah@example.com` | Record cleanings, amend records |
| Supervisor | `priya.nair@example.com` | All of the above, plus verify records and manage equipment |
| Auditor | `anita.rao@example.com` | Read-only review |

### A five-minute tour

Open `http://localhost:5173/` first — the public landing page, with a scroll-driven 3D card (Three.js)
showing a cleaning record flip from pending to verified and fan out into its full field-level trail.
Click **Sign in** to reach the app.

1. Sign in as **Priya Nair** (supervisor). The sidebar's **Overview** shows the verification backlog,
   a 30-day activity chart, and recent audit entries.
2. Open **Equipment → Mixing Tank 02** — 28 cleaning records, so pagination has three pages.
3. Filter to **Pending**, and note the total updates with the filter, not just the visible rows.
4. Switch **Pagination** to *Keyset (cursor)* to exercise the cursor implementation.
5. Click **History** on a verified record — the trail shows `Pending → Verified` with the old value
   struck through, and who signed it off.
6. Click **Edit** on a record and change *only the notes*. Reopen **History**: the new entry contains
   the notes field and nothing else.
7. Save the form again without changing anything: **no new audit entry appears.**
8. Open the sidebar's **Cleaning Records** and **Audit & Compliance** pages — both work across every
   asset at once (the per-equipment pages above are scoped to one), with their own filters.
9. Open **⌘K** (or **Ctrl+K**) — jump to any page, or search equipment by name or code.
10. Under **Settings → Users**, add an account, or deactivate one and confirm it can no longer sign in.
11. Sign in as **Rahul Verma** (operator) and try to verify a record — refused with a 403, and the
    **Users** nav item is gone entirely.

---

## API reference

Base URL `http://localhost:4000`. All routes except `/api/health` and `/api/auth/login` require
`Authorization: Bearer <token>`.

### Auth

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| `GET` | `/api/auth/me` | Current user from the token |
| `GET` | `/api/auth/users` | Staff directory for the "cleaned by" picker |
| `POST` | `/api/auth/password` | `{ currentPassword, newPassword }` → `204`. Takes effect on next login |

### Accounts (supervisor only)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/users` | Paginated. `?page` `?limit` `?role` `?isActive` |
| `POST` | `/api/users` | Provision a new account. `{ name, email, role, password }` |
| `PATCH` | `/api/users/:id` | `{ role? , isActive? }`. Refuses to deactivate your own account |

### Equipment

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/equipment` | Paginated. `?page` `?limit` `?status` `?search` (name or code) |
| `POST` | `/api/equipment` | **Supervisor only.** `409` on duplicate code |
| `GET` | `/api/equipment/:id` | |
| `PATCH` | `/api/equipment/:id` | **Supervisor only** |
| `DELETE` | `/api/equipment/:id` | **Supervisor only.** `409` if cleaning history exists — retire instead |

### Cleaning records

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/equipment/:equipmentId/cleaning-records` | `?mode` `?page` `?limit` `?status` `?cursor` |
| `POST` | `/api/equipment/:equipmentId/cleaning-records` | Writes the record + a `CREATE` audit entry atomically |
| `GET` | `/api/equipment/:equipmentId/cleaning-records/:recordId` | |
| `PATCH` | `/api/equipment/:equipmentId/cleaning-records/:recordId` | Diffs, then writes record + `UPDATE` audit entry atomically |
| `GET` | `/api/equipment/:equipmentId/cleaning-records/:recordId/audit` | Paginated history, newest first |

### Cross-equipment (the Cleaning Records and Audit & Compliance pages)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/cleaning-records` | Every record, any asset. `?mode` `?page` `?limit` `?status` `?equipmentId` `?cleanedById` `?method` `?from` `?to` |
| `GET` | `/api/audit` | The compliance-wide trail. `?page` `?limit` `?action` `?changedById` `?equipmentId` `?field` `?from` `?to` |
| `GET` | `/api/dashboard/stats` | Overview page: equipment/record counts, 30-day activity, recent audit entries |

### Health

`GET /api/health` → `{ "status": "ok", "database": "up" }`, or `503` when the database is unreachable.

### Examples

```bash
# Sign in
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"priya.nair@example.com","password":"Password123!"}' | jq -r .token)

# List pending records, 10 per page
curl -s "localhost:4000/api/equipment/$EQ/cleaning-records?status=PENDING&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Change one field
curl -s -X PATCH "localhost:4000/api/equipment/$EQ/cleaning-records/$REC" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"notes":"Additional rinse performed"}'

# ...and read the trail
curl -s "localhost:4000/api/equipment/$EQ/cleaning-records/$REC/audit" \
  -H "Authorization: Bearer $TOKEN"
```

### Response shapes

Paginated:

```jsonc
{
  "data": [ /* … */ ],
  "pagination": {
    "mode": "offset", "page": 1, "limit": 10, "total": 28,
    "totalPages": 3, "hasNextPage": true, "hasPreviousPage": false
  }
}
```

Errors — one shape for every failure, so the client has a single branch to write:

```jsonc
{
  "error": {
    "code": "VALIDATION_ERROR",       // UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT | WRITE_CONFLICT | INTERNAL_ERROR
    "message": "Request body is invalid",
    "details": [{ "path": "cleanedAt", "message": "Cleaning cannot be recorded in the future" }]
  }
}
```

---

## How the audit trail works

A `PATCH` to a cleaning record goes through this path:

```
PATCH /…/cleaning-records/:id   { "notes": "Additional rinse performed" }
   │
   ├─ authenticate            → req.user comes from the verified JWT
   ├─ validate                → Zod schema from packages/shared
   │
   └─ BEGIN TRANSACTION (SERIALIZABLE)
        ├─ read the record as it is now              ← inside the transaction
        ├─ diffFields(before, patch, AUDITED_FIELDS) ← pure function, no DB
        │     └─ empty change set? → commit, write no audit entry
        ├─ apply domain rules (who may verify, reason required, …)
        ├─ UPDATE cleaning_records
        └─ INSERT audit_logs { action, changedById, changes, reason }
      COMMIT        ← both writes land, or neither does
```

Four properties this is built to guarantee:

1. **Only what changed is recorded.** Resending the whole object with one edited field produces an
   audit entry containing that one field.
2. **A no-op produces no entry.** Saving a form without editing it adds nothing to the trail.
3. **The record and its audit entry are atomic.** If the audit insert fails, the record update is
   rolled back — a change with no trail is exactly the failure mode this system exists to prevent.
   There is a test that forces the insert to fail and asserts the rollback.
4. **The actor cannot be spoofed.** `changedById` comes from the verified token; a `changedById` in
   the request body is ignored. Note that this is a different person from `cleanedById`, who is
   whoever physically performed the cleaning.

On top of that, `audit_logs` carries a PostgreSQL trigger that rejects `UPDATE` and `DELETE`, so the
trail is append-only as a database guarantee rather than an application convention.

A stored change set:

```json
{
  "status":       { "old": "PENDING", "new": "VERIFIED" },
  "verifiedAt":   { "old": null,      "new": "2026-09-04T04:36:47.972Z" },
  "verifiedById": { "old": null,      "new": "01a07da1-f9a7-740d-9b34-37c4bc2540e9" }
}
```

---

## Pagination

Both modes are implemented on the cleaning-records endpoint, and the UI has a toggle so the keyset
path is demonstrable rather than merely present.

**Offset** (default) — `?page=2&limit=10`. Returns `total` and `totalPages`, which the numbered page
controls need. `total` reflects the active filter.

**Keyset** — `?mode=cursor&limit=10`, then follow `pagination.nextCursor`. Ordered by
`(cleanedAt DESC, id DESC)` and seeking on that tuple, so records sharing a timestamp are still
ordered totally. The cursor is base64url of `{ cleanedAt, id }` and is validated on the way back in;
a tampered cursor returns `400`, never a crash.

`limit` is clamped to 100 rather than rejected, so a client asking for 10 000 rows gets 100 back
instead of an error it has to special-case.

The reason both exist is covered by a paired test: insert a record between two page reads, and
offset repeats a row while keyset returns the correct next slice. See NOTES.md for why offset is
still the default.

---

## Tests

```bash
pnpm test                  # all 77
pnpm test:unit             # 21, no database, ~150 ms
pnpm test:integration      # 56, against equipment_cleaning_log_test
```

Integration tests run against a **real PostgreSQL**, not a mocked Prisma client, because the
behaviour under test — transaction rollback, the immutability trigger, keyset ordering — only exists
in the database. They set `NODE_ENV=test`, which makes the config select `TEST_DATABASE_URL`, apply
migrations once per run, and truncate every table between tests.

| File | Tests | Covers |
|---|---|---|
| `test/unit/audit-diff.test.ts` | 11 | Unchanged fields omitted · single and multi-field changes · `null → value` and `value → null` · absent-vs-null on a PATCH · dates compared by value not identity · keys outside the allow-list ignored |
| `test/unit/pagination.test.ts` | 10 | Page-count arithmetic including exact multiples and empty sets · cursor round-trip · malformed and tampered cursors |
| `test/integration/audit.test.ts` | 10 | `CREATE` entry contents · only-changed-field recording · no entry on a no-op · actor taken from the token not the body · **rollback when the audit insert fails** · **`UPDATE`/`DELETE` rejected on `audit_logs`** · reason required to amend a verified record |
| `test/integration/pagination.test.ts` | 12 | 25 records → 10/10/5 · filter narrows `total` too · out-of-range page · limit clamping · keyset walks the set exactly once · ties on identical timestamps · **offset drift vs keyset stability** |
| `test/integration/auth.test.ts` | 8 | Login · identical response for wrong password and unknown account · forged token rejected · supervisor-only equipment management · supervisor-only verification · no self-verification · client-supplied `status` ignored on create |
| `test/integration/global-lists.test.ts` | 13 | Cross-equipment filtering (asset, method, actor) · inclusive UTC day-range boundaries · invalid range rejected · keyset walks the unscoped set · global-audit field/action/actor/equipment filters, verified against the seeded data's ground truth · dashboard stats match the underlying rows |
| `test/integration/user-management.test.ts` | 13 | Supervisor-only provisioning · duplicate email 409 · weak password rejected · deactivated account cannot log in · a supervisor cannot deactivate their own account · reactivation · role/status filters · password change requires the current password and rejects an unchanged one |

---

## Deployment

Three free tiers, one per concern:

| Piece | Host | Config in repo |
|---|---|---|
| PostgreSQL | Neon | — |
| API | Render (free web service) | [`render.yaml`](./render.yaml) |
| Web | Vercel (Hobby) | [`apps/web/vercel.json`](./apps/web/vercel.json) |

The API is a **long-running Node service**, not a set of serverless functions. It keeps a real `pg`
connection pool, does its writes inside `SERIALIZABLE` transactions, and owns a graceful-shutdown
path; on a function runtime each invocation would open its own pool and need PgBouncer in front,
which is a bad trade for exactly those transactions. `apps/web` is a static SPA, so it goes anywhere.

### 1. Database — Neon

Create a project and copy the **direct** connection string, not the `-pooler` one (this service has
its own pool). Then apply the schema and seed it **from your machine** — no paid shell required:

```bash
DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require" \
  pnpm --filter @ecl/api exec prisma migrate deploy

DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require" \
  pnpm --filter @ecl/api exec tsx prisma/seed.ts
```

An inline variable overrides `.env`, so only the database is redirected. Check `NODE_ENV` is not
`test` in your `.env` first, or `config/env.ts` selects `TEST_DATABASE_URL` and you seed the wrong
database. **The seed `TRUNCATE`s all four tables** — it is a deliberate, manual step, never part of a
deploy.

### 2. API — Render

New → Blueprint → pick this repo; [`render.yaml`](./render.yaml) supplies the build, start and health
settings. Then set the three secrets it marks `sync: false`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon string from step 1 |
| `JWT_SECRET` | `openssl rand -base64 48` — 32 chars minimum or the app refuses to boot |
| `CORS_ORIGIN` | the Vercel origin from step 3, exact, no trailing slash |

Keep the Render region matching Neon's, or every query crosses a continent.

### 3. Web — Vercel

Import the repo with **Root Directory `apps/web`** (Vercel still installs from the workspace root),
framework Vite, output `dist`. Set `VITE_API_URL` to the Render URL with no trailing slash.

`vercel.json` rewrites every path to `index.html`, without which a refresh on `/app/equipment` 404s.

### 4. Close the loop

1. Put the Vercel production origin into `CORS_ORIGIN` on Render and redeploy the API.
2. **Redeploy the web app.** `VITE_API_URL` is inlined at *build* time, so a value set after the
   first build is not in the deployed bundle. This is the most common way this goes wrong.
3. Check both ends:

```bash
curl https://your-api.onrender.com/api/health   # {"status":"ok","database":"up"}
```

`CORS_ORIGIN` is an exact-match list, so Vercel **preview** deployments are not allowed — demo from
the production URL.

### Living with the free tier

- **Cold starts.** The instance sleeps after ~15 minutes idle and takes ~30–60s to wake. Point a free
  cron (e.g. cron-job.org) at `/api/health` every 10 minutes while the app is being reviewed. Note
  the budget: free allows ~750 instance-hours a month and one always-awake service uses ~730, so
  this works for exactly one service. The sign-in form also explains itself if a request passes four
  seconds, so a cold start reads as waking rather than broken.
- **Shared, mutable demo data.** Everyone gets the same seeded accounts and `audit_logs` refuses row
  deletes by design, so whatever visitors do accumulates permanently. Re-running the seed is the only
  reset, and it truncates — so do it *before* sharing the link, not while someone is reading.
- **Node pinning.** [`.node-version`](./.node-version) pins 24 because the root `package.json`
  allows `>=20` and Prisma 7 rejects odd-numbered majors with a confusing preinstall failure.

---

## Project structure

```
.
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   │   ├── …_init/
│   │   │   │   └── …_audit_log_immutability/   ← the append-only trigger
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── config/env.ts                   Zod-validated environment
│   │   │   ├── domain/
│   │   │   │   ├── audit/diff.ts               ← the diff engine (pure)
│   │   │   │   └── pagination/cursor.ts        ← keyset cursor encode/decode
│   │   │   ├── middleware/                     authenticate · validate · errors
│   │   │   ├── modules/
│   │   │   │   ├── auth/ · users/              login, password change, provisioning
│   │   │   │   ├── equipment/
│   │   │   │   ├── cleaning-records/           ← transactional audit writes (per-asset + global)
│   │   │   │   ├── audit/                      global compliance-wide trail
│   │   │   │   └── dashboard/                  Overview page's stats endpoint
│   │   │   ├── app.ts                          buildApp(), no listen()
│   │   │   └── server.ts
│   │   └── test/{unit,integration,helpers}/
│   └── web/
│       └── src/
│           ├── components/
│           │   ├── ui/                         shadcn/ui primitives (generated, brand-themed)
│           │   └── layout/                      AppShell · AppSidebar · CommandPalette · route guards
│           ├── features/
│           │   ├── auth/ (sign-in) · overview/ · equipment/ · cleaning-records/ · audit/
│           │   ├── settings/                    profile · users · preferences
│           │   └── landing/                     public "/" page + the Three.js scroll scene
│           ├── hooks/queries.ts                TanStack Query layer
│           └── lib/                            api client · auth · formatting · preferences
├── packages/shared/src/                        Zod schemas + DTOs (both apps)
├── docker-compose.yml
├── README.md
└── NOTES.md
```

---

## Scripts

Run from the repository root.

| Command | Does |
|---|---|
| `pnpm dev` | API and web together |
| `pnpm build` | Type-check and build all three packages |
| `pnpm test` | Full test suite |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm lint` | ESLint across the workspace |
| `pnpm db:generate` | Regenerate the Prisma client (also runs automatically on `pnpm install`) |
| `pnpm db:migrate` | Apply migrations (dev) and regenerate the client |
| `pnpm db:seed` | Reset data and reseed |
| `pnpm db:reset` | Drop, re-migrate, reseed |
| `pnpm db:studio` | Prisma Studio |
