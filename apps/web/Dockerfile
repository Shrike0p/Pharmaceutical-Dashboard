# Built from the repository root:
#   docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @ecl/web... --filter @ecl/shared

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Vite inlines VITE_* at build time, so the API URL has to be known here rather
# than at container start.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/apps/web
RUN pnpm exec vite build

# --- serve -----------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# The app uses client-side routing, so unknown paths must fall through to
# index.html instead of 404ing.
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
