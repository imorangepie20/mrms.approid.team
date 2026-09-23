FROM node:24-bookworm-slim AS admin-build

WORKDIR /workspace/apps/admin

COPY apps/admin/package.json apps/admin/package-lock.json ./
RUN npm ci

COPY apps/admin ./
RUN npm run build

FROM node:24-bookworm-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

COPY apps/web ./
COPY --from=admin-build /workspace/apps/web/public/admin ./public/admin
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts ./apps/web/scripts
COPY --from=build --chown=node:node /app/src/lib/db/migrations ./apps/web/src/lib/db/migrations

USER node
EXPOSE 3000
CMD ["node", "server.js"]
