# Engineering notes

Decisions, trade-offs, and what I deliberately left out. Setup and API details are in
[README.md](./README.md).

---

## The shape of the problem

The brief looks like CRUD, but the thing actually being graded is the audit trail — and an audit
trail is only worth anything if it is *correct*, *complete*, and *hard to tamper with*. A trail that
is subtly wrong is worse than no trail, because people will trust it. So most of the design effort
went into three questions:

1. Can an entry ever record the wrong old value?
2. Can a change ever land without an entry?
3. Can anyone alter the trail after the fact?

Nearly every decision below follows from one of those.

---

## Data model

### `cleanedById` (the subject) is separate from `AuditLog.changedById` (the actor)

The brief's `CleaningRecord.cleanedBy` conflates two different people. An operator can file a record
for a cleaning a colleague performed; a supervisor can correct a typo on someone else's record. The
regulator cares about both, and about telling them apart.

So `cleanedById` is the person who did the physical work — chosen in the form, and itself an audited
field. `AuditLog.changedById` is whoever mutated the row, and it is *only ever* taken from the
verified JWT. There is deliberately no code path that lets a request body nominate it. There is a
test that sends a `changedById` in the body and asserts it is ignored.

### `changes` is JSONB, not a column per field

Different updates touch different fields. The alternative —
`old_status`/`new_status`/`old_notes`/`new_notes`/… — needs a migration every time the record gains
a field, and most columns are null on most rows.

The cost is that the trail is not statically typed at the database level, and a query like "show me
every status transition" needs a JSON operator rather than a plain column. That is the right trade
here: PostgreSQL indexes JSONB perfectly well if that query ever matters, and the schema stays
stable as the domain grows.

The values inside are normalised to JSON scalars (dates to ISO strings, `undefined` to `null`)
before storage. That is also why `FieldChange` is typed as `{ old: AuditValue; new: AuditValue }`
rather than `unknown` — the precise type is what lets a change set be handed to Prisma's JSON input
without an unchecked cast.

### UUIDv7 primary keys

Time-sortable, so `(cleanedAt, id)` is a usable total order for keyset pagination, while the ids
stay opaque in URLs. Auto-increment integers would leak how many records exist and make ids
guessable; random UUIDv4 would give up the sortable tie-breaker.

### snake_case tables, camelCase in code

`@@map`/`@map` throughout. It is the PostgreSQL convention, and it keeps the hand-written SQL — the
immutability trigger, the truncation in tests — free of quoted identifiers. `"AuditLog"` needs
quotes everywhere; `audit_logs` does not.

### `onDelete: Restrict` everywhere, no cascades

Deleting a piece of equipment must not silently take its cleaning history with it, and deleting a
cleaning record must not take its audit trail. Cascades are convenient and exactly wrong here.

---

## Prisma over raw SQL

Chosen for typed queries against the schema, migrations as reviewable committed SQL, and a
transaction API with an explicit isolation level.

What it costs: the keyset predicate cannot be expressed as PostgreSQL's row-value comparison
`(cleaned_at, id) < (:a, :b)`. Prisma builds the logically equivalent
`cleaned_at < :a OR (cleaned_at = :a AND id < :b)`. The planner handles it with the composite index,
but the row-value form is tighter, and in raw SQL I would have written that.

The place raw SQL was clearly right — the immutability trigger — is a hand-written migration.

Prisma 7 notes, since they are recent enough to surprise: `url` is gone from the schema datasource
(the connection string now lives in `prisma.config.ts` for Migrate, and the client connects through
`@prisma/adapter-pg`), `.env` is no longer auto-loaded, and the `prisma` CLI's `latest` npm tag
currently points at an `8.0.0-rc`. It is pinned to `7.10.0` to match `@prisma/client`.

---

## The audit trail

### The diff engine is a pure function

`apps/api/src/domain/audit/diff.ts` takes plain objects and returns a change set. No Prisma, no
Express, no clock. That is what makes it exhaustively testable, and it is why the logic lives in
`domain/` rather than inside the service.

Three subtleties it exists to get right:

- **`undefined` is not `null`.** On a `PATCH`, `{}` means "change nothing" and `{ notes: null }`
  means "erase the notes". Conflating them would let an empty request body wipe a record — and
  record it as though that were intended.
- **Dates compare by value.** Two `Date` objects for the same instant are `!==`. Comparing by
  reference would log a spurious `cleanedAt` transition on every single update.
- **The field list is an allow-list.** Not "every key on the object". This keeps `id`/`createdAt`
  out of the trail, and stops a caller smuggling an arbitrary key in via the request body.

### Unchanged fields are omitted, and a no-op writes nothing

An entry containing `notes: { old: "x", new: "x" }` is noise. An audit trail padded with "user
opened the form and pressed save" is harder for an auditor to read, not safer. If the change set is
empty the request still succeeds — it just adds nothing to the trail.

This is a judgement call and it is arguable. Someone could reasonably want a record of *attempted*
saves. I would want that as a separate access log, not mixed into the change history.

### `SERIALIZABLE`, and why it is not paranoia

The record and its audit entry are written in one transaction — otherwise a failed audit insert
leaves an untraceable change.

Less obviously, the *read* of the prior state also happens inside that transaction, at
`SERIALIZABLE`. Under the default `READ COMMITTED`, two concurrent `PATCH`es could each read the
same `before` row and each write an audit entry claiming the same old value. Nothing would error.
The record would end up correct and the trail would be quietly, plausibly wrong — the worst possible
outcome for this system.

PostgreSQL aborts one of the transactions instead. Prisma surfaces that as `P2034`, the error
handler maps it to `409 WRITE_CONFLICT`, and the client can retry.

The cost is real: `SERIALIZABLE` reduces write throughput and introduces retryable failures for
concurrent edits of the *same record*. For a cleaning log — a handful of writes per record, ever —
that is free. On a hot table it would need revisiting, probably via optimistic concurrency on a
version column instead.

**With more time:** the API should retry `P2034` itself once or twice with a short backoff before
surfacing the 409. Right now the burden is on the client.

### Immutability is enforced by the database

`audit_logs` has a trigger that raises on `UPDATE` and `DELETE`. The application never issues
either — but "the application does not do that" is a convention, and conventions do not survive a
future developer, a migration script, or somebody at a `psql` prompt. In a regulated context the
guarantee belongs where it cannot be bypassed.

**Deliberate gap:** `TRUNCATE` still works. It does not fire row-level triggers, and the seed script
and test suite need to reset the database. It requires table ownership, so it stays an explicit
administrative act rather than something application code can reach. A production deployment would
close this by having the application connect as a role with `INSERT`/`SELECT` on `audit_logs` and
nothing more — which is the better answer anyway, and is where I would take it next.

---

## Pagination

Both modes are implemented; offset is the default.

**Why offset is the default:** the UI shows numbered pages and "showing 11–20 of 28", which needs a
total count. Keyset cannot provide one without a separate `COUNT`, at which point its main advantage
is gone. For a per-asset cleaning history — tens to low thousands of rows — offset's deep-page cost
never materialises.

**Why keyset exists anyway:** offset addresses a *position*. Insert a row ahead of the reader
between two page requests and everything shifts, so the reader sees an item twice (and on deletion,
misses one). Keyset addresses a *value*, so it cannot happen. There is a paired test that
demonstrates exactly this: same insertion, offset repeats a row, keyset returns the correct next
slice.

Two details worth pointing at:

- The order is `(cleanedAt DESC, id DESC)`, not `cleanedAt` alone. Two cleanings can share a
  timestamp; without the tie-breaker the order is not total and keyset would drop rows. This is also
  why Prisma's built-in `cursor` option was not used — it seeks on a single unique column and cannot
  express "same timestamp, smaller id". There is a test with six records sharing one timestamp.
- The cursor is base64url of `{ cleanedAt, id }` and is **not signed**. It encodes only values the
  caller can already see in the response, so signing would protect nothing. It *is* schema-validated
  on the way in, so a tampered cursor yields a `400` rather than a crash or a strange query.

`limit` is clamped to 100 rather than rejected — a client asking for 10 000 gets 100, not an error
it has to handle.

---

## API design

**Nested routes** — `/api/equipment/:equipmentId/cleaning-records/:recordId`. A cleaning record has
no meaning detached from the asset it describes. The handler verifies the record actually belongs to
that equipment and returns `404` otherwise, so a record cannot be read through the wrong parent.

**One error shape**, from a single error handler, with a machine-readable `code` and optional
per-field `details` so a form can highlight the offending input rather than showing a detached
banner. Prisma's `P2002`/`P2025`/`P2003`/`P2034` are mapped to domain errors so the client never
sees a database-shaped failure. Extracting the conflicting field from `P2002` needs care on Prisma 7:
with a driver adapter the old `meta.target` is gone and the constraint name arrives instead, so both
shapes are handled.

**Express 5** forwards rejected promises from async handlers to the error handler automatically,
which is why no route in this codebase wraps itself in `try/catch`.

### Two domain rules that bend the brief

**`DELETE /api/equipment/:id` refuses when cleaning history exists** (`409`, pointing at
`PATCH { status: "RETIRED" }`). The brief says "CRUD for equipment", and this is a literal
reading bent slightly. Destroying cleaning history to tidy up an asset list is precisely what a
regulated system must not permit. Delete still works for equipment with no history, so the "D" is
genuinely there. Happy to change it if the intent was a plain hard delete.

**A record always starts `PENDING`.** `status` is not accepted on create — a client-supplied
`"VERIFIED"` is ignored, with a test to prove it. Letting the creator self-declare a record verified
would defeat the two-person rule the status field exists to express.

---

## Authentication and roles

Real JWT auth: bcrypt-hashed passwords, `POST /auth/login` issues an 8-hour token, middleware puts
`req.user` on every request. The audit actor is the authenticated principal, never a client string —
without this the "who" in the trail is decoration.

Three roles, and two rules that are more than decoration:

- Only a `SUPERVISOR` can move a record `PENDING → VERIFIED`.
- A supervisor **cannot verify a cleaning they are recorded as having performed** — segregation of
  duties. The UI hides the button in that case, and the API refuses it regardless, because a UI
  check is a convenience and not a control.

Amending an already-verified record requires a stated `reason`, which is stored on the audit entry
rather than on the record.

**Trade-offs taken knowingly:**

- The identity is reconstructed from the token's claims rather than re-read from the database each
  request. Stateless and cheap, but a role change does not take effect until the token expires.
- The token is kept in `localStorage`, which is XSS-readable. An httpOnly cookie plus CSRF
  protection is the better answer for a real deployment; it was not worth the extra moving parts
  here.
- No refresh tokens, no revocation list, no password reset, no rate limiting on login. The login
  endpoint *does* compare against a dummy hash for unknown accounts so that a wrong password and an
  unregistered email take the same time and return an identical response — otherwise it doubles as
  an email-enumeration oracle.

---

## Front-end

**Shared Zod schemas.** `packages/shared` is imported by both apps, and React Hook Form resolves
against the exact schema the API validates with. One definition of "a valid cleaning record",
including the "not in the future" rule. This is the single cheapest guard against client and server
drifting.

**TanStack Query** for server state. After a mutation, both the record list *and* that record's
audit trail are invalidated — forgetting the second is what makes an audit panel appear to "miss"
the change the user just made.

**Four states everywhere** — loading (skeleton), empty, error with retry, data — as shared
components, so "loading" cannot silently become a blank screen in one place and a spinner in another.

**Native `<dialog>`** for modals: focus trapping, Escape-to-close, and the top layer for free, all
of which hand-rolled overlays routinely get wrong.

**URL as state.** Page, filter, and pagination mode live in the query string, so a view can be
linked and survives a refresh.

**Hand-written UI primitives** rather than a component library. The surface needed here — button,
badge, field, modal, skeleton — is small enough that configuring a library would cost more than
writing it, and it keeps the dependency list honest.

---

## Testing

51 tests: 21 unit, 30 integration.

**Integration tests run against real PostgreSQL, not a mocked Prisma client.** The three things most
worth testing — transaction rollback, the immutability trigger, keyset ordering under ties — do not
exist in a mock. A mocked suite here would be self-congratulatory.

Two tests I would point a reviewer at:

- **Rollback on audit failure.** It installs a temporary trigger that makes the audit insert throw,
  issues a real `PATCH`, and asserts the record is unchanged and no entry was written. Forcing the
  failure inside the database exercises the transaction for real rather than testing a mock's
  behaviour.
- **Offset drift vs keyset stability.** Same scenario run twice: offset repeats a specific known
  row, keyset returns exactly the two rows that genuinely follow. It asserts *which* row repeats,
  not merely that some overlap exists, so it cannot pass vacuously.

**Not covered:** there are no front-end tests. Given the time budget I put the effort into the
audit and pagination logic, which is where correctness actually lives and what the brief singles
out. With more time the first additions would be a component test for the audit timeline's
`old → new` rendering and one Playwright journey covering record → verify → trail.

The UI *was* verified end-to-end manually via a headless browser during development — login,
pagination in both modes, status filtering, a live verify updating the trail without a refresh — but
that was a check, not a committed test.

---

## What I deliberately left out

| Left out | Why |
|---|---|
| Electronic signatures (21 CFR Part 11) | Meaning-of-signature, re-authentication at signing, signature manifestations. Real requirements for this domain, well beyond the brief. |
| Audit trail for `Equipment` | The brief specifies auditing cleaning records. The same diff engine would extend to it — it is generic — but I did not want to imply scope that was not asked for. |
| Audit export / review reports | An auditor eventually wants a signed PDF or CSV, not a web panel. |
| Soft deletes and record versioning | The audit trail already reconstructs history; a second mechanism would be redundant here. |
| Front-end tests | See above. |
| Deployment | Local-only by choice. Docker Compose is committed; there is no hosted instance. |
| i18n, timezone selection | Timestamps render in the viewer's locale and zone via `Intl`. A real plant needs an explicit site timezone. |

---

## What I would do differently with more time

1. **Retry `P2034` server-side** before surfacing a 409 (see the `SERIALIZABLE` section).
2. **Least-privilege database role** for the application — `INSERT`/`SELECT` only on `audit_logs`.
   That is a stronger guarantee than the trigger and would close the `TRUNCATE` gap.
3. **Move the token out of `localStorage`** to an httpOnly cookie with CSRF protection.
4. **A generic `auditable` service wrapper** so a second entity gets an audit trail by configuration
   rather than by copying the transaction block.
5. **Front-end tests**, starting with the audit timeline.
6. **`EXPLAIN ANALYZE` on the keyset query at scale.** The composite index is there and is right in
   principle, but at ~70 seeded rows the planner will sequential-scan regardless, so the index is
   currently unproven rather than verified. I would want to see it used at a few hundred thousand
   rows before claiming it works.
7. **Structured audit querying** — "every status transition in March", "everything Priya changed" —
   which is the query an auditor actually arrives with, and which the current record-scoped endpoint
   cannot answer.

---

## Toolchain notes

- **Node 24 LTS**, pinned in `.nvmrc`. Prisma 7 refuses Node 23 and other odd-numbered releases,
  which is a confusing failure if you hit it.
- **TypeScript 5.9.3, not 7.0.x.** TypeScript 7 (the native-port rewrite) is now `latest` on npm,
  but plugin compatibility across ESLint, Vitest and Prisma is still settling. A take-home is the
  wrong place to debug toolchain bleed; this is a deliberate pin, not an oversight.
- **`prisma` pinned to `7.10.0`.** Its `latest` tag currently resolves to `8.0.0-rc.13` while
  `@prisma/client@latest` is `7.10.0`, so an unpinned install produces a mismatched CLI/client pair.
- **`strict` TypeScript plus `noUncheckedIndexedAccess`** across the workspace. The latter is why
  route parameters go through a `param()` helper that fails loudly rather than through non-null
  assertions.
