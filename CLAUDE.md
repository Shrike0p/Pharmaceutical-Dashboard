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
apps/web          React 19 + Vite + TanStack Query + shadcn/ui on Tailwind 4
                  + a public landing page (Three.js scroll scene, its own bundle chunk)
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
pnpm test            # 77 tests (unit + integration)
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

## Frontend architecture

`apps/web/src/App.tsx` is the route tree: `/` (public landing page, lazy-loaded on its own bundle
chunk), `/signin`, and `/app/*` behind `RequireAuth`
+ `AppShell` (sidebar, header, `⌘K` command palette). `/app/settings/users` additionally sits behind
`RequireSupervisor`. Route guards live in `components/layout/route-guards.tsx`.

`components/ui/` is shadcn/ui, generated then brand-themed (colors, radii, shadows in `index.css` and
`components/ui/card.tsx` / `button.tsx`) — treat it as vendored-but-ours, not untouchable. Shared
non-generated pieces: `components/data-states.tsx` (loading/empty/error), `components/status-badges.tsx`
(the only place verification green appears), `components/person-cell.tsx` (avatar + name, used
everywhere a person is listed in a table).

**The sidebar is hand-built, not shadcn's.** `components/layout/AppSidebar.tsx` is an
Aceternity-style hover-expanding rail (76px → 264px, labels fading in beside their icons), and
shadcn's `components/ui/sidebar.tsx` primitive was **deleted** rather than left dead beside it.
Notes for anyone changing it:

- **The shell is a frame, not two columns.** `AppShell` paints a dark ground (`bg-shell-950`) that
  the sidebar sits directly on, and the content is an inset `rounded-3xl` panel. The *panel* scrolls
  (`overflow-hidden` on the shell, `overflow-y-auto` on `<main>`), so the rail and the rounded
  corners never move.
- **Labels stay mounted** and are clipped by the rail's `overflow-hidden`, animating opacity only.
  Animating `display`, or unmounting the text, is what makes this pattern stutter.
- **Expansion is `pinned || hovered`.** Hover-only is a demo affordance — the labels would never be
  on screen while you were reading the page. `pinned` persists via `sidebarPreference`, and its
  toggle lives in `AppHeader` because it must stay reachable while the rail is collapsed (and
  inside the rail it stole enough width to truncate the wordmark).
- **The active indicator is one shared `layoutId`** so it glides between entries. Desktop and mobile
  pass different `layoutIdPrefix` values — two mounted copies sharing a `layoutId` makes motion try
  to animate between them.

**Known gotchas already hit here:**
- **shadcn's `CommandDialog` does not wrap children in cmdk's own `<Command>` provider** in this
  version. `CommandInput`/`CommandList` need an explicit `<Command>` ancestor
  (`components/layout/CommandPalette.tsx`) or they crash on open reading from a context that was
  never mounted.
- **`Card` ships `flex flex-col` by default.** Adding `flex-wrap` to a `Card`'s className does *not*
  cancel that direction — Tailwind treats `flex-direction` and `flex-wrap` as independent groups, so
  both apply and content wraps into a vertical stack instead of a row. Any filter-bar-style `Card`
  needs an explicit `flex-row`.

### Three.js — three separate surfaces

**Colour spaces bite here.** Three applies its linear→sRGB output conversion inside the shader
chunks its *built-in* materials include. Every scene below uses a hand-written `ShaderMaterial`,
which has no such chunk, so whatever the fragment shader writes is displayed as-is:
`convertSRGBToLinear()` on a uniform therefore **darkens** rather than corrects. `SealScene` omits
it (linearising rendered its green check near-black); `GradientCanvas` keeps it on purpose, because
the deeper result holds contrast under white text. Don't "unify" these without looking at both.

**Every consumer must `React.lazy` a Three surface.** `three` is ~519KB in its own shared async
chunk; one eager import anywhere pulls it into the main app bundle.

`features/landing/three/AuditTrailScene.tsx` is the scroll-driven 3D card on the landing page: two
`PlaneGeometry` meshes (front/back, one pre-rotated 180°) grouped and rotated together for the flip,
canvas-drawn textures (`three/card-textures.ts`) with `alphaTest` for rounded corners instead of
extruded geometry. Scroll progress is tracked in a plain ref and read inside a `requestAnimationFrame`
loop — never `setState` for a continuously-changing value. See NOTES.md for the full reasoning.

`features/landing/three/SealScene.tsx` is the second landing scene and a deliberately different
technique: ~7,000 `THREE.Points` whose motion is computed entirely in the vertex shader from two
static attributes (start, target) plus a scroll uniform, so the CPU does nothing per frame and no
geometry is rebuilt. Points converge into the brand mark. `depthWrite` is off — overlapping sprites
would otherwise punch holes in each other instead of blending.

`components/three/GradientCanvas.tsx` is the animated colour field: one full-screen quad running a
domain-warped fBm fragment shader, no geometry or lights. Used on the sign-in panel (`brand`
palette) and as the dark hero band on Overview and the equipment detail page (`shell` palette). It
renders at 70% scale (`RENDER_SCALE`) because a smooth gradient has no detail to lose, pauses on
`IntersectionObserver` + `document.hidden`, and renders one settled frame under
`prefers-reduced-motion`.

**`forceContextLoss()` is deliberately not called on teardown**, despite being the usual advice for
the ~16-context limit. Chrome will not grant a new context in the same task as a forced loss, so
any immediate remount (StrictMode's mount → cleanup → mount replay, or a fast route toggle) gets
`null` from `getContext` and Three throws reading `capabilities.precision`, blanking the route.
Both scenes instead create their own `<canvas>` imperatively and `.remove()` it on cleanup, which
is what actually lets the context be collected.

## Charts

`dataviz` conventions are followed deliberately; the ones that bite:

- **The two activity series are `pending-600` and `verify-700`, not brand coral and green.** Coral
  vs green measures ΔE 4.4 under deuteranopia — effectively one colour to a red-green colourblind
  reader. The status pair passes every check and matches the status badges. Do not "re-brand" it.
- **Columns carry one hue.** `TopAssetsChart`'s categories are nominal, so per-bar colours would
  double-encode the height. Bars are capped at 24px with a 4px rounded data-end.
- **Verification split is a meter, not a donut.** Two slices is a stat tile wearing a costume.
- Values are always readable without hovering (y-axis, or a label on each column) — a tooltip may
  enhance but never gate.

## Pagination

Both modes live on the cleaning-records list endpoint (and its cross-equipment counterpart,
`GET /api/cleaning-records`); offset is the default because the UI needs `totalPages`. The global
audit endpoint (`GET /api/audit`) and the account-admin listing (`GET /api/users`) are offset-only —
both are bounded reports a reviewer pages through with a known total, not a feed needing
concurrent-insert stability.

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
- There is deliberately **no signup route** — accounts are provisioned, via the seed and via
  `POST /api/users` (supervisor-only, `/app/settings/users` in the UI), because self-registration
  would undermine the traceability the audit trail exists to provide.
- Deactivating a user (`isActive: false`) does not touch `audit_logs` — that table is scoped to
  cleaning records by design; see NOTES.md for why a second audit domain was not folded into it.
