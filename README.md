# BEAPMS

## Production deployment

The repository includes a production Node image, health endpoint, migration
runner, and a PostgreSQL-backed Dokploy Compose stack. See
[`docs/deploy-dokploy.md`](docs/deploy-dokploy.md). Local development continues
to use `docker-compose.yml`; Dokploy should use `docker-compose.prod.yml`.

## Current configuration

### Super-admin demo switching

Apply migration `013-super-admin.sql` after 012. A separately provisioned `Super Admin` signs in to `/admin`, searches users, and chooses **Act as user**. A persistent banner offers **Switch user** and **Return to admin**. Active non-admin accounts can be impersonated across SUBEB and UBEC; each retains its own state, department and workflow permissions. Inactive accounts and other super-admins cannot be impersonated. This is not a sandbox: writes affect the selected user's actual workspace.

Impersonation expires after one hour. The original administrator has a revocable server-side session; impersonation is bound to that session and invalidated by account deactivation or session-version changes. Switching and returning end the previous impersonation. Start/end records identify both people, and write attempts are logged separately without request bodies. Workflow histories continue to record the effective user. Other open portal tabs reload when the identity changes. Super-admin privileges cannot be granted through state user management.

For a local-only demo, run `node --env-file=.env scripts/create-local-super-admin.mjs`. It creates `admin@demo.local` with a random password in an ignored, owner-readable file under `outputs/local-super-admin/`; it never changes an existing account. Do not reuse demo identities in production. Set a private `AUTH_SECRET` of at least 32 characters. Run `node --env-file=.env scripts/test-impersonation.mjs` for isolated security checks. Production deployment should add MFA and operational access controls before granting this powerful role.

Copy `.env.example` to `.env` and set private values before starting Docker. `POSTGRES_PASSWORD` must match the password in `DATABASE_URL`; for an existing database, use its current password. Changing the environment file does not rotate an existing database password. No accounts or password hashes are provisioned by the initial schema.

The plan overview groups nine funding components under Quality, Access and System Optimisation. SUBEB component responsibilities follow the reference workflow; Infrastructure and Supervision belong to Physical Planning, and TLMs to Academic Services. Only Infrastructure and Sports editors are implemented.

Migration `012-funding-policy.sql` adds versioned allocations. The UBEC Executive Secretary can change component shares at `/ubec/allocations`. Components must total 100%. TLM has no share of its own: Infrastructure and TLM draw from one pool (the 75% infrastructure share plus their funding sources) with no split; older policy rows that still carry `tlmWithinInfrastructure` are read and ignored. New plans capture the current policy; existing plans retain theirs. These are planning shares, not enforced spending ceilings.

The SUBEB dashboard shows department-scoped pending actions for staff, Directors and the Executive Chairman. Run `node --env-file=.env scripts/test-funding-policy.mjs` against the local preview to check permissions, version pinning and pending actions. The BEAP Chair appointment grants plan creation; the separate consolidation handoff is not implemented yet.

## UBEC national review

UBEC accounts sign in to `/ubec`; SUBEB accounts retain `/dashboard`. The national interface uses a charcoal, lavender and lime palette, responsive summary cards, submission-activity charts, stage counts, a searchable state queue, department workload and an audit trail. All totals come from submitted snapshots, not fabricated metrics or disbursed funding. Latest submissions are counted once per plan; monthly activity includes resubmissions.

Apply `db/postgres/006-ubec-review.sql` after the earlier PostgreSQL migrations. It adds national roles, versioned UBEC rounds, department assignments and review events without replacing state plans. Fresh Docker volumes apply it automatically.

Flow: department staff send each pillar to their department Director → the Director reviews, edits, or returns that pillar to staff → Director sends it to the state Executive Chairman → **Chairman sends the completed plan to UBEC** → UBEC ES assigns departments → departments submit recommendations → UBEC ES returns consolidated feedback or approves. “Approve” is reserved for the final UBEC decision. Historical snapshots remain immutable; concurrent and stale decisions are rejected. UBEC approval does not release money.

## SUBEB roles and user management

Migration `024-user-departments.sql` adds multi-department assignments. Data Entry Staff and Directors may be assigned one, several, or all SUBEB departments from the user interface; component visibility, editing, submission, review routing, and Director management permissions all use the complete assignment. A nominated BEAP Chair remains a Physical Planning Director but is kept out of the ordinary department-Director recipient path when a separate assigned Director exists.

For a fresh nationwide demo, `scripts/seed-production-users.mjs` creates four accounts for each of Nigeria's 36 states and the FCT: one all-department Data Entry Officer, one all-department Director, one Physical Planning Director nominated as BEAP Chair, and one Executive Chairman. It also creates the Super Admin and UBEC review accounts. Set `SEED_SHARED_PASSWORD` to the agreed shared password; the script requires it and uses it for every generated account.

Apply migrations 007, 008 and `db/postgres/009-plan-creation-permission.sql` in order (fresh Docker volumes apply them automatically). Migration 008 adds independent pillar review states and permits one active Director per department per state. Existing Directors without a department remain unassigned until the Chairman explicitly assigns one. Legacy state-level submissions require department review again; plans already with UBEC and historical submissions are retained. Migration 009 defaults delegated plan creation to false. The Executive Chairman can always create plans and can grant/revoke creation for their state users in Users. Delegation does not change pillar editing or review permissions and cannot be passed on by Directors. Permission changes are audited and invalidate the target's existing session.

Run `node --env-file=.env scripts/test-plan-creation-permission.mjs` against the local running preview to verify plan-creation authorization. It removes only its own isolated test accounts and plans.

Directors and Chairmen have a **Users** header link (`/users`). Directors manage staff within their own department; the Chairman manages staff and department Directors throughout the state. Neither can change their own access or manage Chairman/UBEC accounts. Account changes revoke existing sessions; deactivation preserves work. New passwords are displayed once and stored only as hashes; changes are audited. Infrastructure belongs to Physical Planning; Sports retains Academic Services as its default. Staff edit draft/returned pillars; Directors edit their own pillars during department review. Sending a pillar locks it for that department, not other departments.

The Chairman’s server-side send gate requires **all implemented pillars** (Infrastructure and Sports) to contain saved entries and have status `chairman_ready`. The seven unimplemented pillars do not block testing. Chairman feedback returns a pillar to its Director, who can edit or request staff changes. UBEC returns reopen both implemented pillars for staff revision and fresh departmental review.

The nine pillar names and shares follow the user-provided revised formula: Infrastructure Projects and TLMs 75%; Quality Assurance 5%; Teacher development and ICT 5%; SBMC 5%; Sports activities 2%; Supervision and monitoring 2%; Purchase and curriculum distribution 2%; Planning, EMIS & Data platforms 2%; Greening Schools, Climate Change & Safeguarding 2%. Shares are displayed as reference allocations, not enforced budget quotas.

The older `test-subeb-users.mjs` and `test-state-review.mjs` scripts target the previous whole-state Director workflow; do not use them to validate migration 008.

Department reviewers can access only assigned pillars. SUBEB sees departmental feedback after the national ES publishes a decision. Default lead routing in `lib/ubec.ts` is a proposed operational mapping based on [UBEC department responsibilities](https://ubec.gov.ng/departments/), not an officially published pillar matrix. Infrastructure defaults to Physical Planning; Sports to Academic Services. Mappings for the seven unimplemented pillars are provisional until their editors and routing are confirmed. Currently only Infrastructure and Sports collect data and can be routed. The ES can choose other or supporting departments.

The assignment catalogue contains the ten UBEC departments plus Zonal and State Offices. Internal units are not separate assignment destinations. Existing historical records and accounts are retained; removed unit entries cannot receive new assignments.

For local testing only, `DATABASE_URL=<local connection> node scripts/create-ubec-demo-users.mjs` creates `ubec.es@demo.local` and `ubec.<department-id>@demo.local` for the 11 assignment destinations. It prints a randomly generated password once, refuses remote databases and never changes existing accounts. Obtain approval before provisioning privileged accounts; do not use demo identities in production. Real deployments require provisioned staff identities and a private `AUTH_SECRET`.

Run `DATABASE_URL=<local connection> node scripts/test-ubec-review.mjs` with the app on port 5174. It covers routing, role/state/department isolation, frozen submissions, feedback, return/resubmission, final approval, concurrent decisions and real analytics, then removes its own test records. These account-based suites target the older whole-state workflow. Run `node scripts/test-department-review-rules.mjs` for the new pure department and readiness rules.

## Local UBEC PostgreSQL data

The local development database is defined in `docker-compose.yml`. Start it with `docker compose up -d`, then seed it from the provided school workbook with `python3 scripts/seed-yobe-schools.py`. The importer loads the Yobe primary, JSS, and SSS rows, normalises the known LGA spelling differences, assigns stable synthetic male/female learner counts across the three infrastructure model bands for demonstrations, and creates four initial infrastructure lines. The sample learner counts are not census data and must be replaced with an authoritative DNEMIS/Annual School Census import for production planning. Use `docker compose down -v` only when you intentionally want to remove local database data and initialise it again.

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

### State-defined construction types

Construction types are now saved in PostgreSQL for the signed-in user's state. Staff can search saved types or create one using counts of classrooms, playrooms/labs, libraries, toilets, and offices/stores. Duration and unit cost are reusable defaults; each school line stores its own values and can override those defaults without changing other schools.

For an existing local database, apply the additive migration once:

```sh
docker exec -i ubec-postgres psql -U ubec_app -d ubec -v ON_ERROR_STOP=1 < db/postgres/002-construction-types.sql
```

Fresh Docker volumes apply this migration automatically. Existing project lines and their costs are preserved. Previously used templates remain available with their original descriptions; unspecified historical room counts are not guessed. Unused hard-coded templates are no longer offered.

With the local app running, run the isolated checks with `node --env-file=.env --experimental-strip-types scripts/test-construction-types.mjs`. They create a temporary test workspace and clean up its records, covering validation, duplicate creation, state isolation, saved defaults, school-specific overrides, and the pillar overview's saved totals.

### Action-plan navigation

Sign-in opens `/dashboard`. The Executive Chairman, or a state user they explicitly authorize, creates an annual or multi-year action plan there. Department staff can then enter `/beap?plan=<id>` to choose their pillar. Existing plans can be continued from the dashboard. Infrastructure and Sports development open their split-screen editors with the same plan ID. **Done** returns to that plan's pillars without submitting or marking the plan complete; unfinished lines require confirmation before leaving. Dashboard totals and the pillar overview use saved data, scoped to the signed-in state and selected plan. Other pillar editors remain explicitly unavailable until implemented.

Apply the additive planning-period migration to existing local databases (fresh Docker volumes apply it automatically):

```sh
docker exec -i ubec-postgres psql -U ubec_app -d ubec -v ON_ERROR_STOP=1 < db/postgres/004-action-plans.sql
```

Existing projects are preserved under their original 2025 plan. New plans start empty; construction types remain reusable across the state. Planning periods must be between 2004 and 2100 with an end year on or after the start year. Exact duplicate periods are rejected. Opening an old editor URL without a plan ID resolves the existing 2025 plan; it never creates a plan implicitly.

Run `node --env-file=.env scripts/test-action-plans.mjs` against the local app for isolated checks of plan creation, year ranges, duplicate protection, cross-plan/state isolation, budget totals and preservation of existing data. The script cleans up its temporary records.

### Legacy SUBEB state review (superseded)

The following describes migration 005's original workflow, not the current application. Use the department-based workflow and Chairman-controlled creation rules above for migrations 008–009. The historical test below is not a current acceptance test.

Apply the additive review migration after `004-action-plans.sql` (fresh volumes apply both automatically):

```sh
docker exec -i ubec-postgres psql -U ubec_app -d ubec -v ON_ERROR_STOP=1 < db/postgres/005-state-review.sql
```

Existing plans remain drafts. A Data Entry Officer creates and edits the state's plans, then opens **Review & submit to ES** from the pillar page. `/beap/review?plan=<id>` contains the full saved plan, school allocations, submission versions, and review history. Only saved lines are submitted; in-progress editor fields are not included. A nonempty plan and an Executive Secretary account in the same state are required.

The lifecycle is `draft → awaiting_review → approved`, or `awaiting_review → changes_requested → awaiting_review`. The ES can request changes with required feedback on the whole plan, a pillar, or a specific budget/project line. The officer must describe the response when resubmitting. Approval is SUBEB approval only. **There is no UBEC submission transition yet; when added, it must be restricted to the SUBEB Executive Secretary, never the Data Entry Officer or generic Reviewer.**

The ES dashboard has a review queue; both roles receive persistent in-app plan notifications. Viewing the review marks that user's plan notifications as read. Historical submissions are immutable snapshots. Content writes and workflow transitions share a database row lock; version checks reject stale or duplicate decisions. The database role and state are checked on every request. The legacy `Reviewer` role can view but cannot edit, submit, approve, or return plans.

Run `node --env-file=.env scripts/test-state-review.mjs` against the local app. It creates isolated officer, ES, and foreign-state fixtures, checks the full feedback/resubmission/approval cycle, notifications, version history, permissions, and concurrent actions, then removes only its own test data.

### Sports development

`/beap/sports` follows the Sports Development sheet of the 2025 BEAP form: equipment procurement, competitions, publicity/administration, and supervision/assessment/verification. Each line has a state-defined sport/activity type, description, quantity and unit cost. Equipment references and all totals are calculated automatically. Type suggestions come from the state's saved lines; no catalogue or sample costs are seeded.

The beneficiary-school view allocates saved equipment items to directory schools with optional longitude/latitude. School and sport totals derive from those item allocations, which do not increase the budget. Allocations cannot exceed procurement quantities; allocated equipment cannot be deleted or moved to another sport/section until its allocations are removed. All writes serialize within a state to protect those checks during concurrent requests.

Apply the additive migration to an existing local database (fresh Docker volumes apply it automatically):

```sh
docker exec -i ubec-postgres psql -U ubec_app -d ubec -v ON_ERROR_STOP=1 < db/postgres/003-sports-development.sql
```

Run `node --env-file=.env --experimental-strip-types scripts/test-sports.mjs` with the local app running for isolated API checks. Test data is created in temporary workspaces and removed afterwards.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Action plan setup (migration 010)

Migration `011-beap-chair.sql` adds a state-specific BEAP Chair appointment to a Director account. Only the Executive Chairman can assign or remove it in Users, and one appointment is permitted per state. The nominated Director automatically gains plan creation without changing department permissions. Explicit plan-creation delegation remains independent; removing the appointment removes automatic creation but preserves an explicit grant. Existing accounts are not automatically nominated. This migration does not yet implement the BEAP Chair consolidation handoff or the three-pillar navigation restructure.

Apply `db/postgres/010-plan-setup.sql` after migration 009. New plans use one funding year, one or more funding quarters, an implementation year, state lodgment and other funding. UBEC counterpart matches the lodgment and the funding envelope is calculated by the database. The state comes from the authenticated account, never from the form.

Quarter reservations are unique per state/year/quarter, including concurrent requests. Existing plans retain their original data and reserve their complete historical periods; no funding details or attachments are fabricated. New creation requires a private RAT attachment (PDF, XLSX or DOCX, up to three files, 5 MB each and 10 MB combined). Documents are stored transactionally with the plan and downloaded only by the state team or authorized UBEC reviewers after submission. File signatures are checked; malware scanning is not yet integrated. Production deployment should add scanning and a storage/retention policy.

Run `node --env-file=.env scripts/test-plan-setup.mjs` and `node --env-file=.env scripts/test-plan-creation-permission.mjs` against the local preview. Both use isolated temporary state records and clean up after themselves. Older plan-creation tests using JSON year ranges target the superseded creation contract.

## Infrastructure school packages (migration 015)

Apply `db/postgres/015-infrastructure-packages.sql` after 014 on existing PostgreSQL installations. Fresh Docker databases apply it automatically. The superseded project-line editor and its routes are no longer exposed or included in current budgets and review snapshots; historical submission snapshots remain unchanged.

Infrastructure now starts at `/beap/infrastructure` with New Construction, Whole School Renovation/Expansion and Furniture/Equipment. School enrolment and coordinates can be completed in the identification step and saved to the state register. Model 1 (Small School) covers 1–240 learners, Model 2 (Medium School) covers 241–320, and Model 3 (Large School) covers 321+. Packages freeze the school facts used for their calculation.

The calculation module `lib/infrastructure-model.ts` implements the supplied BEAPMS v17 reference. HOPE costs classroom rows as lump sums (not multiplied by block count), other requirements by quantity except lump-sum toilets, and adds 7.5% VAT to other costs and to classroom costs only for NCB. Non-HOPE uses a single total with strategy and duration. Whole School Renovation/Expansion audits distinguish existing/functional stock, round primary classroom deficits to blocks of three, and generate separate civil renovation/construction packages. Other gaps use functional stock. Fence length is state-provided. PWD accessibility is embedded in designs, not a separate budget line. The reference's activity percentages do not override the configurable funding policy.

Documents are stored as actual bytes in PostgreSQL, validated by size/type/signature, and downloaded through authorized routes. Apply migration `016-infrastructure-school-documents.sql` after 015: drawings remain shared at plan level; BOQs and geophysical survey reports belong to individual schools. BOQs accept only Excel or PDF files. Submission requires a BOQ per school and a geophysical survey report for each school with construction/Whole School Renovation/Expansion work; furniture-only schools do not require a survey. Updating a Whole School Renovation/Expansion package requires a newly uploaded BOQ for that school. School documents can be shared by packages for the same school, never across schools. Package updates use version checks, department permissions and the existing plan transaction lock. Saved submissions retain their original package details and attachment references. Files are limited to 5 MB each and 100 per plan.

Checks: `node --experimental-strip-types scripts/test-infrastructure-model.mjs` tests calculations; `node --experimental-strip-types --env-file=.env scripts/test-infrastructure-packages.mjs` exercises isolated local fixtures and removes them afterward. Deployment to another database requires applying migrations 015 and 016 before serving the updated application.

## Diagnostic Commands

SBMC and TLM editors use the PostgreSQL migration `db/postgres/014-activity-plans.sql` (apply once to existing installations). SBMC belongs to Social Mobilization; TLM belongs to Academic Services and remains inside the Infrastructure/TLM allocation. Both use the existing department review lifecycle. TLM additionally requires a distribution school before review submission. Run `node --env-file=.env scripts/test-activity-plans.mjs` against the local development server to verify isolated fixtures; the script removes its test records afterward.

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the standalone production server
- `npm run start`: preview the built Worker locally
- `npm run db:generate`: generate Drizzle migrations after schema changes

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
### Attachment removal

Apply `db/postgres/017-document-removal.sql` to existing databases. Editable infrastructure attachment tiles support confirmed removal. Removed files are excluded from the working plan and package references; their stored content remains available to authorized historical reviews. Removal uses the same locked department/stage permission checks as other infrastructure edits.
