# Multi-stage Docker build for DocuTrust
FROM node:24-alpine AS base
WORKDIR /app

# Stage 1: Build client and server
FROM base AS builder
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

RUN npm run build

# Stage 2: Production runtime
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

COPY package.json ./
COPY server/package.json ./server/
COPY --from=builder /app/node_modules ./node_modules
# server/dist already contains the compiled shared/ modules (tsc's rootDir
# spans both server/src and ../shared, see server/tsconfig.json), so nothing
# else needs to be copied from the shared/ source directory.
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# node:24-alpine ships an unprivileged "node" user (uid/gid 1000). The SQLite
# database is created at server/data/docutrust.db on first run (see
# server/src/config.ts), so that directory needs to exist and be writable
# before dropping root.
RUN mkdir -p /app/server/data && chown -R node:node /app/server/data
USER node

EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/dist/server/src/index.js"]
