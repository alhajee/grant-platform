# PostgreSQL with no known CVEs (checked with Trivy, 16 November 2026). The official image's gosu is built with an old
# Go toolchain; its entrypoint only runs `gosu postgres ...` to drop root, which Alpine's su-exec does the same way.
# Pinned versions make Dokploy (`up --build`, no pull) fetch exactly this base; bump them to take updates.
FROM postgres:16.16-alpine3.24
RUN apk upgrade --no-cache \
 && apk add --no-cache su-exec \
 && ln -sf /sbin/su-exec /usr/local/bin/gosu
