# Built from the repository root so the workspace packages are in context:
#   docker build -f apps/api/Dockerfile .
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# --- dependencies ----------------------------------------------------------
# Manifests are copied on their own so this layer is cached until a dependency
# actually changes, rather than on every source edit.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# --- build -----------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN pnpm exec prisma generate && pnpm exec tsup

# --- runtime ---------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/package.json ./package.json

WORKDIR /app/apps/api
EXPOSE 4000
USER node

# Apply committed migrations, seed if the database is empty, then serve. Seed
# failures are tolerated so a restart against an already-populated database
# does not take the container down.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && (pnpm exec tsx prisma/seed.ts || echo 'seed skipped') && node dist/server.js"]
