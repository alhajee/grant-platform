# PostgreSQL with no known CVEs (checked with Trivy, 16 November 2026). The official image's gosu is built with an old
# Go toolchain; its entrypoint only runs `gosu postgres ...` to drop root, which Alpine's su-exec does the same way.
# The result is flattened into one layer so the old gosu binary is not kept in a lower layer (scanners still see it
# there otherwise); the official image's settings are repeated below.
# Pinned versions make Dokploy (`up --build`, no pull) fetch exactly this base; bump them (and PG_VERSION) to update.
FROM postgres:16.16-alpine3.24 AS patched
RUN apk upgrade --no-cache \
 && apk add --no-cache su-exec \
 && rm -f /usr/local/bin/gosu \
 && cp /sbin/su-exec /usr/local/bin/gosu

FROM scratch
COPY --from=patched / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=en_US.utf8 \
    PG_MAJOR=16 \
    PG_VERSION=16.16 \
    PGDATA=/var/lib/postgresql/data
VOLUME /var/lib/postgresql/data
STOPSIGNAL SIGINT
EXPOSE 5432
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["postgres"]
