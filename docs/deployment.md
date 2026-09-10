# Deployment

How the live demo is hosted, and the traps worth knowing before redeploying it. This is a runbook
rather than something a reviewer needs — the architectural decision behind it (a long-running Node
process rather than serverless functions, and why) is in
[NOTES.md §11](../NOTES.md#11-docker--deployment).

---

Three free tiers, one per concern:

| Piece | Host | Config in repo |
|---|---|---|
| PostgreSQL | Neon | — |
| API | Render (free web service) | [`render.yaml`](../render.yaml) |
| Web | Vercel (Hobby) | [`apps/web/vercel.json`](../apps/web/vercel.json) |

The API is a **long-running Node service**, not a set of serverless functions. It keeps a real `pg`
connection pool, does its writes inside `SERIALIZABLE` transactions, and owns a graceful-shutdown
path; on a function runtime each invocation would open its own pool and need PgBouncer in front,
which is a bad trade for exactly those transactions. `apps/web` is a static SPA, so it goes anywhere.

## 1. Database — Neon

Neon gives you two connection strings and they are not interchangeable:

| Use | String | Why |
|---|---|---|
| Migrations & seed | **direct** (no `-pooler`) | `prisma migrate` takes advisory locks, which transaction pooling cannot hold |
| The running API | **`-pooler`** | Free compute suspends when idle; PgBouncer absorbs the reconnect instead of handing the next request a dead socket |

Transaction pooling keeps a whole transaction on one server connection, so `SERIALIZABLE` is
unaffected, and node-postgres uses unnamed prepared statements, so there is nothing to disable.

Apply the schema and seed it **from your machine** with the *direct* string — no paid shell required:

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

## 2. API — Render

New → Blueprint → pick this repo; [`render.yaml`](../render.yaml) supplies the build, start and health
settings. Then set the three secrets it marks `sync: false`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon **`-pooler`** string (not the direct one used for migrations) |
| `JWT_SECRET` | `openssl rand -base64 48` — 32 chars minimum or the app refuses to boot |
| `CORS_ORIGIN` | the Vercel origin from step 3, exact, no trailing slash |

Keep the Render region matching Neon's, or every query crosses a continent.

## 3. Web — Vercel

Import the repo with **Root Directory `apps/web`** (Vercel still installs from the workspace root),
framework Vite, output `dist`. Set `VITE_API_URL` to the Render URL with no trailing slash.

`vercel.json` rewrites every path to `index.html`, without which a refresh on `/app/equipment` 404s.

## 4. Close the loop

1. Put the Vercel production origin into `CORS_ORIGIN` on Render and redeploy the API.
2. **Redeploy the web app.** `VITE_API_URL` is inlined at *build* time, so a value set after the
   first build is not in the deployed bundle. This is the most common way this goes wrong.
3. Check both ends:

```bash
curl https://your-api.onrender.com/api/health   # {"status":"ok","database":"up"}
```

`CORS_ORIGIN` is an exact-match list, so Vercel **preview** deployments are not allowed — demo from
the production URL.

## Living with the free tier

- **Cold starts.** The instance sleeps after ~15 minutes idle and takes ~30–60s to wake. Point a free
  cron (e.g. cron-job.org) at `/api/health` every 10 minutes while the app is being reviewed. Note
  the budget: free allows ~750 instance-hours a month and one always-awake service uses ~730, so
  this works for exactly one service. The sign-in form also explains itself if a request passes four
  seconds, so a cold start reads as waking rather than broken.
- **Shared, mutable demo data.** Everyone gets the same seeded accounts and `audit_logs` refuses row
  deletes by design, so whatever visitors do accumulates permanently. Re-running the seed is the only
  reset, and it truncates — so do it *before* sharing the link, not while someone is reading.
- **Node pinning.** [`.node-version`](../.node-version) pins 24 because the root `package.json`
  allows `>=20` and Prisma 7 rejects odd-numbered majors with a confusing preinstall failure.

---
