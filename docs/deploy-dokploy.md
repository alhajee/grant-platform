# Deploying the UBEC Grant Portal with Dokploy

The production stack is defined in `docker-compose.prod.yml`. It builds the
application as a standalone Node server, keeps PostgreSQL private, applies each
database migration once, and persists database data in a named Docker volume.
The local-development `docker-compose.yml` remains separate.

## Before deployment

1. Commit and push the repository to the Git provider Dokploy can access.
2. Point the domain's DNS `A` record to the Dokploy server.
3. Generate two independent secrets. Hex values avoid URL-encoding problems in
   the PostgreSQL connection string:

   ```sh
   openssl rand -hex 32
   openssl rand -hex 32
   ```

   Use one as `POSTGRES_PASSWORD` and the other as `AUTH_SECRET`. Do not rotate
   either casually: the database password must be changed in PostgreSQL as well,
   and changing `AUTH_SECRET` signs everyone out.

## Create the Dokploy Compose service

1. In Dokploy, create a project and add a **Compose** service.
2. Choose **Docker Compose** (not Docker Stack).
3. Select the GitHub/Git provider, repository, and production branch.
4. Set **Compose Path** to `./docker-compose.prod.yml`.
5. In **Environment**, add:

   ```dotenv
   POSTGRES_PASSWORD=<first generated value>
   AUTH_SECRET=<second generated value>
   ```

6. Deploy. The expected order is PostgreSQL healthy → migrations complete →
   application starts. The app health endpoint is `/api/health`.

Dokploy writes UI environment values to a Compose `.env` file, but those values
are only available inside a container when the Compose file explicitly references
them. This stack references only the two required secrets.

## Domain and HTTPS

Use Dokploy's **Domains** tab rather than adding Traefik labels manually:

- Service: `app`
- Container port: `3000`
- HTTPS: enabled with the configured certificate provider

Do not publish the PostgreSQL port. Only the application belongs on the public
proxy network; PostgreSQL and the migration runner use an internal network.

## Provision the first accounts

The production database deliberately contains no demo accounts. From the
Compose checkout directory on the Dokploy server, provision the first privileged
accounts with the optional `tools` profile. Values supplied with `-e` are used
only by that one-off container and are not stored in the Compose file.

```sh
docker compose -f docker-compose.prod.yml --profile tools run --rm \
  -e PROVISION_NAME='Portal Administrator' \
  -e PROVISION_EMAIL='admin@example.gov.ng' \
  -e PROVISION_PASSWORD='<strong one-time password>' \
  -e PROVISION_ROLE='Super Admin' \
  provision
```

Provision the first state Executive Chairman in the same way, adding the state
code:

```sh
docker compose -f docker-compose.prod.yml --profile tools run --rm \
  -e PROVISION_NAME='Executive Chairman' \
  -e PROVISION_EMAIL='chairman@example.gov.ng' \
  -e PROVISION_PASSWORD='<strong one-time password>' \
  -e PROVISION_ROLE='Executive Chairman' \
  -e PROVISION_STATE_CODE='YO' \
  provision
```

The password must contain at least 16 characters with upper-case, lower-case,
numeric, and symbol characters. Provisioning refuses to replace an existing
email. Use the portal's user-management workflow for ordinary Directors and
staff after the first Chairman signs in.

If national review is required immediately, repeat the command with role
`UBEC Executive Secretary`; its workspace is assigned automatically.

## Data, backups, and operations

- The production initializer excludes the local demo schools and sample projects.
  Import only the reviewed production school register, or add schools through
  the permitted application workflow.
- Keep the named `ubec_postgres_data` volume. Do not use `docker compose down -v`.
- Configure Dokploy S3 volume backups for `ubec_postgres_data`, retain several
  generations, and test a restore before launch.
- Review the `postgres`, `migrate`, and `app` logs after every deployment.
- A failed migration prevents the app from starting; fix the migration rather
  than bypassing the `migrate` dependency.
- Use one production Compose project for the database. Preview/isolated
  deployments should use a separate database and separate secrets.

## Go-live security checklist

- Enforce HTTPS and verify secure session cookies in the browser.
- Restrict Dokploy/server access and enable host firewalling and security updates.
- Add MFA or an upstream identity/access layer before granting Super Admin access.
- Add malware scanning and an approved retention policy for uploaded RAT,
  infrastructure, BOQ, and survey documents.
- Confirm database backups, restore procedures, monitoring, and alerting.
- Run role/workflow acceptance testing using non-production fixtures before users
  enter real data.

