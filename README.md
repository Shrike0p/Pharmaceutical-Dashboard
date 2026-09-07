# Equipment Cleaning Log

A small full-stack slice of a pharmaceutical manufacturing system: equipment is cleaned between
production runs, each cleaning is recorded and verified, and **every create and update is captured in
a field-level audit trail** — who changed what, when, and from which value to which.

- **API** — Node.js 24 · TypeScript · Express 5 · Prisma 7 · PostgreSQL 17
- **Web** — React 19 · TypeScript · Vite · TanStack Query · React Hook Form · Tailwind CSS 4
- **Shared** — one package of Zod schemas imported by *both* sides, so the request contract cannot
  drift between client and server
- **Tests** — Vitest, 51 tests (21 unit, 30 integration against a real PostgreSQL)

Design decisions and trade-offs are in **[NOTES.md](./NOTES.md)**.

---

## Contents

- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Sign-in credentials](#sign-in-credentials)
- [API reference](#api-reference)
- [How the audit trail works](#how-the-audit-trail-works)
- [Pagination](#pagination)
- [Tests](#tests)
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

1. Sign in as **Priya Nair** (supervisor).
2. Open **Mixing Tank 02** — 28 cleaning records, so pagination has three pages.
3. Filter to **Pending**, and note the total updates with the filter, not just the visible rows.
4. Switch **Pagination** to *Keyset (cursor)* to exercise the cursor implementation.
5. Click **History** on a verified record — the trail shows `Pending → Verified` with the old value
   struck through, and who signed it off.
6. Click **Edit** on a record and change *only the notes*. Reopen **History**: the new entry contains
   the notes field and nothing else.
7. Save the form again without changing anything: **no new audit entry appears.**
8. Sign in as **Rahul Verma** (operator) and try to verify a record — refused with a 403.

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
pnpm test                  # all 51
pnpm test:unit             # 21, no database, ~150 ms
pnpm test:integration      # 30, against equipment_cleaning_log_test
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
│   │   │   │   ├── auth/
│   │   │   │   ├── equipment/
│   │   │   │   └── cleaning-records/           ← transactional audit writes
│   │   │   ├── app.ts                          buildApp(), no listen()
│   │   │   └── server.ts
│   │   └── test/{unit,integration,helpers}/
│   └── web/
│       └── src/
│           ├── components/                     ui primitives, pager
│           ├── features/{auth,equipment,cleaning-records,audit}/
│           ├── hooks/queries.ts                TanStack Query layer
│           └── lib/                            api client · auth · formatting
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
