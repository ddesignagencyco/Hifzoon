# One image, two roles (TRD section 16.2 / section 4.2): the API serves HTTP, the
# worker runs BullMQ processors and cron. `npm run build` produces both entry points,
# and the container picks one with `node dist/main.js` or `node dist/worker.js`.

# ── deps ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
# `npm ci` at the workspace root installs the whole graph, including the native
# argon2 build, before any source is copied so a code change does not bust the cache.
RUN npm ci --workspace @hifzoon/shared --workspace @hifzoon/api --include-workspace-root

# ── build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# The Prisma client is generated code, not committed; the build cannot typecheck without it.
RUN npm run db:generate --workspace @hifzoon/api \
 && npm run build --workspace @hifzoon/shared \
 && npm run build --workspace @hifzoon/api \
 && npm prune --omit=dev --workspace @hifzoon/api

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# tini reaps zombies and forwards signals so `docker stop` reaches Nest and the
# workers close their BullMQ connections cleanly instead of being SIGKILLed.
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=4000

COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /repo/apps/api/package.json ./package.json

# The API never needs to be root (NFR-SEC-01).
USER node

EXPOSE 4000

# K8s-style probes hitting the Nest routes rather than a shell script.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
