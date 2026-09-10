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
| Dark mode | The design pass deliberately kept the app light throughout — a compliance tool read for hours needs the contrast dense tables want, not atmosphere. Dark-mode CSS variables exist (inherited from shadcn's defaults) but are untuned; see the "App direction" decision below. |
| Audit trail for account provisioning | Creating, deactivating or changing a user's role writes no audit entry. `audit_logs` is scoped to cleaning records by design (see the original audit-trail section); conflating a second, unrelated audit domain into the same table would muddy every query against it. A real system would want a separate security-event log for this. |
| Per-route code-splitting beyond landing/app | Only the landing page (and its one heavy dependency, `three`) is split from the authenticated app. The app itself is one ~1.4MB chunk. |

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
7. ~~**A shared-layout sliding active indicator** in the sidebar.~~ Done in the sidebar rewrite (see
   below) — and the reason it had been expensive turned out to be the right thing to remove, not to
   work around.
8. **Per-route code-splitting inside the authenticated app** — right now only landing-vs-app is
   split; Settings, Records and Audit could each be their own chunk too.

---

## The design pass: shell, redesign, and a marketing landing page

After the functional build, a second pass added a proper application shell (sidebar, command
palette, seven pages including account provisioning) and a public landing page. This section covers
the decisions specific to that pass; the audit/pagination reasoning above is unchanged by any of it.

### Elevation: cards had zero shadow

Every `Card` in the first pass carried only a 1px ring, no `box-shadow` at all — the single biggest
reason the app read as a wireframe rather than a finished product once real content was in it. Fixed
with a layered, **navy-tinted** shadow system (`--shadow-card`, `--shadow-card-hover`,
`--shadow-popover`), not the generic gray Tailwind ships or a harsh black drop-shadow. Three stacked
layers (contact / ambient / cast) read as physical elevation; one flat blur does not. The same tokens
now back every popover, select, dropdown and dialog, which previously used Tailwind's default
`shadow-md`/`shadow-lg` — inconsistent with the cards sitting next to them.

### Every displayed number is either a raw value or an honestly-derived one

The Overview stat tiles show trend lines ("+10 this week"). These are **not** invented placeholder
metrics — `verifiedThisWeek` and `createdThisWeek` are summed from the same `activity` array the
chart already renders, in the browser, from real data. Where no honest derivation existed (a
backlog-trend arrow would need historical backlog snapshots this system doesn't keep), the tile got a
descriptive line instead ("Awaiting supervisor review") rather than a fabricated number. This was a
deliberate line not to cross even under an explicit "make it look impressive" instruction.

### The Three.js scene: two planes, not extruded geometry

The landing page's centerpiece is a scroll-driven 3D card that flips from `PENDING` to `VERIFIED` and
then reveals three "ghost" cards fanning out to show real field-level changes (status, verifiedBy,
notes) — the audit trail, made physical.

Deliberately **not** built from extruded rounded-box geometry with multi-material face groups
(the technically "correct" way to model a physical card): `ExtrudeGeometry`'s material-group ordering
for a beveled shape is genuinely easy to get backwards, and getting it wrong looks like a texture on
the wrong face with no error to point at. Instead: two coplanar `PlaneGeometry` meshes, one at
`rotation.y = 0` (front) and one pre-rotated `rotation.y = Math.PI` (back), grouped together. Animating
the *group's* rotation from `0` to `π` makes the front plane rotate away from the camera exactly as
the back plane rotates into view — the standard flip-card construction, verified by reading the
rendered screenshot text at both ends (not mirrored, not garbled).

Card faces are drawn by hand onto an offscreen 2D canvas — the exact fields the real UI shows
(asset code, actor, timestamp, status), not stock art — then applied as a `CanvasTexture` with
`alphaTest` so the plane's sharp rectangular corners disappear outside a rounded-rect drawn into the
canvas. That is what gives a rounded card silhouette without needing rounded 3D geometry at all.

Scroll is tracked with a passive `scroll` listener writing to a plain ref (never `setState` for a
continuously-changing value — that would re-render on every pixel of scroll) and a `requestAnimationFrame`
loop that lerps toward it, so a fast flick of the wheel settles rather than snapping. An
`IntersectionObserver` stops the render loop entirely while the section is off-screen. Honoured
`prefers-reduced-motion` by skipping the loop and rendering one static, fully-informative frame
instead of nothing.

### Two real crashes found only by running it, again

Both slipped past `tsc` and `eslint` cleanly and only showed up as a blank page in the browser:

- **The whole app rendered blank on first load.** The sidebar's collapsed-mode tooltips need an
  ancestor `TooltipProvider`; without one, Radix throws synchronously during render and — with no
  error boundary — React unmounts the entire tree. One `<TooltipProvider>` around `<App />` in
  `main.tsx` fixed it.
- **The command palette crashed the instant it opened.** This version of shadcn's `CommandDialog`
  does not wrap its children in cmdk's own `<Command>` context provider (unlike the classic pattern
  most existing tutorials assume) — `CommandInput`/`CommandList` were reading from a store that was
  never mounted, throwing "Cannot read properties of undefined (reading 'subscribe')". Fixed by
  wrapping the palette's contents in an explicit `<Command>`.

A third bug was a plain CSS mistake, not a crash: three separate filter bars (Records, Audit, Users)
all rendered as broken vertical stacks instead of a horizontal row, because shadcn's `Card` ships
`flex flex-col` by default and adding `flex-wrap` never actually overrides that direction — Tailwind
correctly treats `flex-direction` and `flex-wrap` as independent groups, so both applied at once.
Fixed with an explicit `flex-row` on each of the three.

### Bundle: `three` is a shared async chunk

`three` is the single heaviest dependency here. Every consumer reaches it through `React.lazy`, so
Rollup hoists it into one shared async chunk (≈519KB, ≈129KB gzipped) that the landing page
(≈32KB), the sign-in panel and the two dashboard hero bands all share. A signed-in user who never
opens a page carrying a canvas never downloads it, and a landing-page visitor never downloads the
dashboard bundle (recharts, the full component set) either. The main app chunk is ~1.44MB (~422KB
gzipped); further splitting per-route was judged not worth the added complexity for this pass and is
the obvious next lever if bundle size becomes a real concern.

---

## The second design pass: split sign-in, real charts, an asset dashboard

The first design pass produced a coherent theme but left several screens as unstyled scaffolding —
a centred sign-in form, a table with no supporting context, stat tiles with no trend. This pass
addressed those specifically.

### The recolour had quietly broken the chart's colourblind safety

Moving the brand hue from navy to coral left the activity chart plotting **coral against verification
green**. Run through the palette validator, that pair measures **ΔE 4.4 for deuteranopia** — below
even the 6–8 "legal only with secondary encoding" floor, i.e. one colour to a red-green colourblind
reader. It passed nobody's eye test because it looks fine to normal vision (ΔE 34).

Fixed by plotting the app's own **status** tokens instead: `pending-600` for Recorded and
`verify-700` for Verified (ΔE 8.8 deutan, and the only candidate pair that also cleared 3:1 contrast
against the card surface). That is not a compromise — it is more correct than what it replaced,
because a cleaning *is* recorded into `PENDING` and later becomes `VERIFIED`, so the chart now reads
in the same two colours as every status badge in the app. This is the strongest argument in these
notes for computing colour instead of judging it.

### Charts: taking the reference's energy, not its encoding

The visual reference for this pass was a neo-brutalist dashboard — pure black, thick borders, wide
rainbow bars. Two of those choices are actively wrong for data, and were not copied:

- **Rainbow bars on nominal categories** double-encode bar length as hue and burn the only free
  channel on information the chart already shows. `TopAssetsChart` uses one hue for all seven
  columns.
- **Very thick saturated blocks** read loud rather than confident. Columns are capped at 24px with a
  4px rounded data-end; the band's leftover width is deliberate air.

What *was* taken: bold titles, a value on every column cap (endorsed for columns, unlike a number on
every point of a line), and hover that scales the mark — the `pop-on-hover` utility, capped at 1.5%
because a card full of text visibly re-rasterises at larger scales.

The verification split is a **meter, not a two-slice donut** — a two-segment pie is a stat tile
wearing a costume, and the unfilled track is a lighter step of the same green ramp so the whole bar
reads as one measure. Every chart value stays readable without hovering (a y-axis, or a direct
label), because a tooltip may enhance but must never gate.

### Dead space was the real complaint about the dashboard

Two cards sat in grid rows next to a taller neighbour and stretched to match it, leaving a void under
their content. Two different fixes, because the cause differs: the meter gets `items-start` on its
row (it is genuinely shorter, and stretching it only adds air), while the column chart's plot is
`flex-1` inside a `flex` card so the columns *grow* into whatever height the row sets.

### The sidebar: deleting the primitive was the fix

The sidebar was the last screen still wearing generated shadcn markup, and it read as the flattest
thing in the app. Restyling it was tried first and kept running into the same wall: every
interesting behaviour — a rail that widens on hover, labels that fade in beside their icons, one
active pill that glides between entries — meant fighting `SidebarMenuButton`'s own `data-active`
background and its collapsed-mode tooltips rather than composing with them.

So `components/ui/sidebar.tsx` (≈700 lines) was **deleted** and replaced with ~250 lines of
hand-written markup. Two things fell out of that immediately:

- The **sliding active indicator** listed above as "skipped for time" became three lines — one
  `motion.span` with a `layoutId`. The cost was never the animation; it was the primitive.
- The **`TooltipProvider` gotcha disappeared entirely.** The blank-page crash documented earlier in
  these notes existed *because* `SidebarMenuButton` rendered Radix tooltips in collapsed mode. With
  the primitive gone, nothing in the app renders a tooltip at all. (The provider stays in
  `main.tsx`; it costs nothing and the next tooltip will need it.)

The shell changed shape too: a dark ground with the content as an inset `rounded-3xl` panel, so the
sidebar sits *on* the page rather than beside a border. The panel scrolls rather than the page,
which is what keeps the rail and the rounded corners still while content moves.

The one deliberate departure from the reference pattern: **it can be pinned.** Hover-only expansion
demos beautifully and is annoying to use — the labels are never on screen at the moment you are
actually reading the page. Pinned is the persisted default; hover only expands while unpinned.

### The fabrication line, again

The sign-in panel's reference showed a customer testimonial card. Inventing a quote from a named
person is exactly the kind of thing this project has refused elsewhere, so the panel carries a real
artefact instead: one audit entry in the shape the database stores it (`Pending → Verified`, actor,
timestamp). Same visual weight, nothing made up. For the same reason the equipment detail header
shows only counts the API actually returns — a per-asset verified/pending split would have had to be
derived from one page of records, which would be wrong past row ten.

---

## Toolchain notes

- **Node 24 LTS**, pinned in `.nvmrc`. Prisma 7 refuses Node 23 and other odd-numbered releases,
  which is a confusing failure if you hit it.
- **TypeScript 5.9.3, not 7.0.x.** TypeScript 7 (the native-port rewrite) is now `latest` on npm,
  but plugin compatibility across ESLint, Vitest and Prisma is still settling. A take-home is the
  wrong place to debug toolchain bleed; this is a deliberate pin, not an oversight.
- **`prisma` pinned to `7.10.0`.** Its `latest` tag currently resolves to `8.0.0-rc.13` while
  `@prisma/client@latest` is `7.10.0`, so an unpinned install produces a mismatched CLI/client pair.
- **`prisma migrate reset` no longer runs the seed** in Prisma 7, unlike Prisma 6. It exits cleanly
  having applied the migrations, leaving an empty database — a silent failure, since nothing errors.
  Caught by actually running the documented command rather than assuming it; `db:reset` now chains
  `prisma db seed` explicitly.
- **`prisma migrate dev` no longer generates the client either.** The generated client is gitignored
  (it is build output, not source), so on a fresh clone nothing produced it and `db:seed`, `test`,
  `typecheck` and `build` all failed. `prisma generate` now runs as a `postinstall`, and the migrate
  scripts chain it too. Both of these were found by cloning the repository into a clean directory
  and following the README literally — worth doing before submitting anything, because the machine
  you built on always has state a reviewer's does not.
- **`strict` TypeScript plus `noUncheckedIndexedAccess`** across the workspace. The latter is why
  route parameters go through a `param()` helper that fails loudly rather than through non-null
  assertions.
