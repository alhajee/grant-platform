FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

FROM dependencies AS build
COPY . .
RUN npm run build && npm run build:worker

FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM production-dependencies AS provision
COPY scripts/provision-production-user.mjs ./scripts/provision-production-user.mjs
COPY scripts/seed-production-users.mjs ./scripts/seed-production-users.mjs
COPY lib/nigeria-map.json ./lib/nigeria-map.json
ENTRYPOINT ["node", "scripts/provision-production-user.mjs"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY --from=production-dependencies --chown=node:node /app/node_modules/ ./node_modules/
COPY --from=build --chown=node:node /app/dist/standalone/ ./
# DNEMIS sync worker (docker-compose `worker` service, or `node worker/dnemis-worker.mjs --once` for a one-off run).
COPY --from=build --chown=node:node /app/dist/worker/ ./worker/
COPY --chown=node:node scripts/seed-production-users.mjs ./scripts/seed-production-users.mjs
COPY --chown=node:node scripts/purge-schools-and-plans.mjs ./scripts/purge-schools-and-plans.mjs
COPY --chown=node:node lib/nigeria-map.json ./lib/nigeria-map.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
