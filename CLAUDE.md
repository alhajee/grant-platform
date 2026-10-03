# BEAPMS project handoff

Last updated: 28 September 2026 (Africa/Lagos)

This file is the working context for any agent continuing this project. Read it before changing code or production data. `README.md` has broader historical detail, but parts of its older workflow narrative are superseded by the current implementation and the requirements below.

## Product and repository

- Product: Basic Education Action Plan Management System (BEAPMS) for UBEC and Nigeria's SUBEBs.
- Repository root: `/Users/muhammad/SANDBOX/Alhajee/UBEC`
- Main stack: Next.js/Vinext, TypeScript, React, PostgreSQL 16, shadcn-style UI components.
- Local portal: `http://localhost:5173`
- Production portal: `https://ubec.byteflow.com.ng`
- Production hosting: Dokploy compose service `ubec-grant-portal-oi6ecu` on `s01.verifio.africa`.
- Production health check: `GET /api/health` should return `{ "status": "ok" }`.
- Deployments follow pushes to `main`.
- Never commit `.env`, passwords, database URLs, backups, or generated credentials.
- Ignore the untracked `output/` directory unless the user explicitly asks about its contents.

## Commands and source-control conventions

- Validate changes with `npm run lint` and `npm run build`.
- The lint run currently has four pre-existing warnings; do not claim zero warnings unless they are actually removed.
- Use `apply_patch` for source edits.
- Preserve unrelated user changes in a dirty worktree.
- The host Git binary may fail while creating an Xcode cache file. The known working fallback is:
  `/Users/muhammad/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/git`
- Push only reviewed, tested changes to `main`; then wait for Dokploy and verify production health.

## Current production data

Production was intentionally cleared and reseeded on 28 September 2026.

- 37 SUBEB/UBEB workspaces: Nigeria's 36 states plus FCT.
- 4 state users per workspace (148 total):
  - one Data Entry Officer assigned all SUBEB departments;
  - one general Director assigned all SUBEB departments, including Physical Planning;
  - one nominated BEAP Chair, implemented as a Physical Planning Director;
  - one SUBEB Executive Chairman.
- 13 non-state users: one Super Admin, one UBEC Executive Secretary, and 11 UBEC department reviewers.
- Total expected users: 161.
- Schools: 79,848 directory records across all 37 states (28 September 2026).
  - Yobe: 1,549 from the original `scripts/seed-yobe-schools.py` load (includes private and SSS).
  - Other 36 states: 78,299 public Primary and JSS schools from `scripts/seed-national-schools.py` (source: `School list-1.xlsx`).
  - Learner counts are synthetic test figures (120–560, stable per school) so infrastructure models can be exercised; replace with DNEMIS/census data for real planning.
  - The import is idempotent (`ON CONFLICT DO NOTHING`) and never changes existing schools. School uniqueness is `(state_code, name, lga, level)` since migration `027-schools-unique-per-state.sql`.
  - Pre-import production backup: `/var/lib/postgresql/data/ubec-before-national-schools-20260928.dump` inside the PostgreSQL container.
- Production action plans were cleared. A temporary end-to-end plan was created after the reset and deleted after the test passed.
- A pre-reset database backup exists inside the production PostgreSQL container at:
  `/var/lib/postgresql/data/ubec-before-national-seed-20260928.dump`
- All seeded accounts use the previously agreed shared password supplied through `SEED_SHARED_PASSWORD`. Do not write the password in this file or source control.
- Account naming and email generation are defined in `scripts/seed-production-users.mjs`.

## Current SUBEB workflow (authoritative)

The required state flow is:

1. Data Entry Staff enters and submits a department component.
2. The assigned department Director reviews it and chooses **Send to BEAP Chair**.
3. All components converge at the nominated SUBEB BEAP Chair.
4. The BEAP Chair sends reviewed work to the **SUBEB Executive Chairman**.
5. The SUBEB Executive Chairman sends the complete plan to UBEC.

The Super Admin configures the BEAP Chair handoff globally:

- `complete_plan`: the BEAP Chair waits for all implemented components and sends one collated submission;
- `individual_components`: the BEAP Chair may forward reviewed components separately.

A second global setting controls the Executive Chairman's handoff to UBEC (`ubec_submission_mode`, migration `026-ubec-submission-mode.sql`):

- `complete_plan` (default): every implemented component must be complete and reviewed before sending to UBEC;
- `reviewed_components`: the Executive Chairman may send whichever components have reached them; unfinished components are left out of the UBEC snapshot and the plan locks during UBEC review. Intended for easy user testing.

These settings apply across every SUBEB, not per state. The implementation lives in:

- `app/api/plans/review/route.ts`
- `app/api/ubec/review/route.ts`
- `app/beap/review/page.tsx`
- `lib/pillar-review.ts`
- `lib/workflow-settings.ts`
- `app/api/admin/workflow-settings/route.ts`

Implemented blocking components (`implementedPillars` in `lib/beap-pillars.ts`): Infrastructure, TLM, Sports, SBMC, Supervision & Monitoring (`monitoring`), Greening Schools, Climate Change & Safeguards (`gscci`) and Curriculum (`curriculum`). Quality Assurance, Teacher development/ICT and Planning/EMIS are still placeholders. The SBMC/TLM activity editor (`components/activity-plan-editor.tsx`, `lib/activity-plans.ts`, `activity_plan_lines.workstream`) also drives the three newer components (migration 036): Monitoring has optional Proforma Invoice uploads (`component_documents`, `app/api/activities/documents/route.ts`); Curriculum has per-activity caps (60/20/10/10% of its envelope) and a distribution list (`tlm_distribution.workstream = 'curriculum'`). Test: `node scripts/test-activity-components.mjs [baseUrl]`.

## Plan workbook comments (migration 028)

Google-Sheets-style review comments on cells and whole rows of the review-page plan workbook. These are the state review chain's (`scope = 'state'`) rules; UBEC comments share the table and UI, see the next section.

- Table `plan_comments` (`db/postgres/028-plan-comments.sql`): root comments (`parent_id` NULL) target `(sheet, row_ref, column_id)`; `column_id` NULL is a row comment; replies copy the root's target. `pillar` is the owning component (the `distribution` sheet belongs to `tlm`). `target_label` and `submission_number` are snapshots taken at creation. One open thread per cell/row (partial unique index). Rows cascade with the plan; `TRUNCATE users CASCADE` would also clear this table.
- `row_ref` is the workbook `row.id`, which is the durable database id: infrastructure = negative `infrastructure_packages.id`, sports = `sports_budget_lines.id`, SBMC/TLM = `activity_plan_lines.id`, distribution = `schools.id`. All editors update these rows in place. Threads whose row or column no longer exists are returned with `orphaned: true` and shown as "No longer in the plan" in the comments panel.
- Rules (`lib/plan-comments.ts`, `app/api/plans/comments/route.ts`):
  - start a thread: only the current holder: the department Director (not the BEAP Chair) at `director_review`, the BEAP Chair at `beap_review`, the Executive Chairman at `chairman_ready`;
  - reply: anyone who can view the component (`canViewComponent`); resolved threads must be reopened first;
  - resolve: that department's Data Entry Staff, the comment's author, or the current holder;
  - reopen: Directors, the BEAP Chair and the Executive Chairman who can view the component;
  - every write requires the same origin, a state role, and an open plan (`statePlanOpen`, otherwise 409). UBEC roles get 403 from this API, and UBEC never sees `scope = 'state'` threads.
- `request_changes` (`app/api/plans/review/route.ts`): the note is optional when the component has open state root comments (shared UBEC threads do not count); the event comment then reads "N comments on specific cells". Without open comments the note stays required.
- UI: `components/plan-workbook/comments-context.tsx` (loading and actions), `comment-layer.tsx` (popover and hover preview), `comment-thread.tsx`, `comments-panel.tsx`; markers in `sheet-grid.tsx`, menu items in `cell-menu.tsx` (Ctrl/Cmd+Alt+M). The review page passes `comments` to `PlanReviewContent` only for the current working plan; the UBEC page passes its own UBEC-scope controller (`usePlanComments(..., { scope: 'ubec', roundId })`). Column ids/headers in `lib/plan-comments.ts` mirror `sheets.tsx`; `scripts/test-plan-comments.mjs` checks they stay in sync.
- The workbook also has a full-screen mode (`use-expanded.ts`, Expand button or `F`, Esc exits): the same element becomes a fixed overlay (z-index 45, below the z-50 Radix portals).
- Test: `node scripts/test-plan-comments.mjs [baseUrl]` (default `http://127.0.0.1:5174`) creates throwaway states, users and a plan, then removes them.

## UBEC comments (migration 029)

UBEC reviewers and the UBEC ES comment on the submitted round's snapshot with the same workbook UI (markers, right-click Comment / Comment on row, Ctrl/Cmd+Alt+M, popovers, panel, tab counts). Threads are internal to UBEC until the ES shares them on return.

- Schema (`db/postgres/029-ubec-plan-comments.sql`): `plan_comments.scope` (`state` | `ubec`, existing rows `state`), `ubec_round_id` (required for, and only for, `ubec`; FK to `ubec_rounds`, cascades), `shared_at` / `shared_by_name` (UBEC root comments only). One open thread per cell/row per scope and UBEC round (`plan_comments_one_open_thread_scope_idx`). Replies copy the root's scope and round.
- UBEC API `app/api/ubec/comments/route.ts` (GET/POST/PATCH, `?plan=` and optional `&round=`), helpers in `lib/ubec-comments.ts`, rules in `lib/plan-comments.ts` (`ubecAbilities`, `sharedUbecAbilities`):
  - UBEC ES: start, reply, resolve and reopen on every populated component of the round. Department Reviewer: the same, only on components assigned to their department in that round (they see nothing else, including other rounds without an assignment).
  - Visibility on round R: the ES sees all UBEC threads written on R; a reviewer sees every UBEC thread (ES and other reviewers) on their assigned components. Threads shared on an earlier round carry forward into later rounds with the state's replies; unshared threads stay on the round they were written on. Nothing written after a closed round's decision is shown on that round.
  - Writes: same origin, user re-read from the DB, UBEC role, the plan's latest round with status `received`/`reviewing` (otherwise 409, also for any `&round=` historical view). Row and column refs are validated against the round snapshot. Nobody at UBEC ever sees `scope = 'state'` threads.
- Sharing: the ES return dialog lists the round's open UBEC threads, all ticked by default (`components/ubec-share-comments.tsx`). `return` accepts `shareCommentIds` (validated to be open UBEC root threads visible on that round, else 400) and sets `shared_at`/`shared_by_name` in the same transaction. `shareCommentIds` with any other action is 400; approval never shares. Re-ticking a carried thread refreshes `shared_at`.
- State side (`app/api/plans/comments/route.ts`): GET returns state threads plus shared UBEC threads only, with UBEC replies written up to `shared_at` and all SUBEB replies (`readStateVisibleRows`). Unshared threads, and UBEC replies after the share time, never leave UBEC. On shared threads anyone who can view the component replies; that department's Data Entry Staff and the reviewer holding the component resolve; nobody at the state starts or reopens UBEC threads (403). Writes still need an open plan (409 while with UBEC or after approval). Response field `otherAbilities` carries the UBEC-thread abilities.
- When UBEC sees SUBEB replies: once the plan is resubmitted. A returned round's view is cut off at its decision time, so replies and resolutions made while the state revises appear on the next round.
- UI: SUBEB workbook shows UBEC threads with blue markers, a "UBEC" badge (thread and panel), an All / SUBEB / UBEC panel filter, "UBEC n" tab chips and "n UBEC comments" on component cards; the send and request-changes dialogs mention open UBEC comments. The UBEC workbook tags threads "Shared" or "Internal". A cell can hold one state and one UBEC open thread; its popover stacks them.
- Test: `node scripts/test-ubec-comments.mjs [baseUrl]` (throwaway states, users and plan; cleans up).

## Notification bell (migration 031)

A bell sits left of the account pill in `SubebHeader` and `UbecShell` (not the Super Admin header). It replaced the dashboard "Plan updates" alert and "Needs your attention" card.

- `plan_notifications` rows point at exactly one source: `event_id` (state review event) or `ubec_event_id` (UBEC event, cascades), enforced by `plan_notifications_one_source`. UBEC events notify the ES on `submit` and `feedback`, and the assigned department's reviewers on `assign` (`app/api/ubec/review/route.ts`). State recipients are unchanged.
- API `app/api/notifications/route.ts`: GET returns the newest 30 notifications, `unreadCount` and `todos` (state roles only, from `lib/pending-actions.ts`, which `/api/plans` also uses for `pendingActions`). PATCH `{ ids }` or `{ all: true }` marks the caller's own notifications read (same origin required). Opening a plan's review still marks that plan's notifications read via `POST /api/plans/notifications`.
- UI: `components/notifications/` (`notification-bell.tsx`, `use-notifications.ts`, `notifications.css`); wording in `lib/notifications.ts`. It polls every 30 s and on focus, shows unread count in the tab title, and raises browser notifications for new arrivals while the window is unfocused, once the user clicks "Turn on". One tab alerts per notification (localStorage `beapms:notifications:alerted-through`).
- A notification with a note links to its Review history entry (`#review-event-<eventId>`); `app/beap/review/page.tsx` scrolls to and flashes it after the review loads. Other state notifications open the component sheet (`#review-<pillar>`). The footer shows only actions: "Mark all as read" while something is unread, and "Turn on desktop alerts" until permission is decided, plus a small Sound toggle (Volume icon button) that is always present.
- Sound (`components/notifications/notification-sound.ts`): a ~0.4 s two-note sine chime made with the Web Audio API (no asset) plays once per poll that brings new notifications, focused or not, sharing the OS alert's "new" decision (`alerted-through`), so never for the initial backlog and only in one tab. The AudioContext is created on the first pointerdown/keydown (browser autoplay rules); until then, or if blocked, it stays silent. The toggle is stored per browser in localStorage `beapms:notifications:sound` (default on; turning it on plays a preview).
- Test: `node scripts/test-notifications.mjs [baseUrl]` (throwaway states, users and plan; cleans up).

## Funding sources and plan editing (migration 035)

- Other funding is component-specific: `plan_funding_sources` rows {component, funder, amount}. A component's ceiling = its policy share of `state contribution ×2 + legacy other_funding` + its own sources (`componentEnvelope(plan, component)` in `lib/funding-policy.ts`). Older plans keep `other_funding` as shared funding; new plans store 0 there. API `fundingTotal` = base + legacy other funding + sources.
- Plans can be edited (year, implementation year, quarters, state contribution, funding sources) by anyone `canCreateStatePlan` allows while `statePlanOpen`, via `components/edit-plan-dialog.tsx` and `app/api/plans/setup/route.ts`; edits that would drop a component's ceiling below its proposed lines are refused, and each edit adds a `plan_review_events` 'edit' entry ("Plan details updated").
- Dashboard cards, the hero total and the BEAP overview show "Other funding" with a per-component tooltip (`OtherFundingInfo` in `components/funding-sources-field.tsx`). Test: `node scripts/test-funding-sources.mjs [baseUrl]`.

## School register (migration 034)

- `/schools` (nav link "Schools") lets the Executive Chairman, the BEAP Chair and users granted `users.can_manage_schools` (toggled by the Executive Chairman on Users or by the Super Admin) add, edit and bulk-import schools from an XLSX template (`app/api/schools/**`, `lib/school-register*.ts`). `schools.school_code` (optional, unique per state) is the future DNEMIS match key; `schools.enrolment_by_class` holds per-class figures, with `enrolment_male/female` as totals.
- School details (enrolment, coordinates) are read-only in the component editors; managers get an "Update in the School register" link. Plan creation has an optional step 4 "Do you have a new school you wish to add?" (`components/new-schools-entry.tsx`).
- DNEMIS integration is pending access. Test: `node scripts/test-school-register.mjs [baseUrl]`.

## Roles and department access

- Data Entry Staff and ordinary Directors can have one, several, or all departments.
- Department assignments are stored in `user_departments`; `users.department` remains the first/legacy department value.
- The state Users interface supports multi-select department assignment.
- A Director can manage only staff whose department set is contained within the Director's own assignments.
- The Executive Chairman can create Directors, nominate the one BEAP Chair, and delegate plan creation.
- The BEAP Chair is visually identified in the account menu.
- Important files:
  - `db/postgres/024-user-departments.sql`
  - `lib/user-departments.ts`
  - `lib/workspace-state.ts`
  - `app/api/users/route.ts`
  - `app/api/admin/users/route.ts`
  - `app/users/page.tsx`
  - `components/department-checkboxes.tsx`

## Recent user-facing work

- Removed the unneeded “Accessible by design” component.
- Renamed “Whole School Approach” to “Whole School Renovation/Expansion”.
- Whole-school audit uses the table as the editing entry point; redundant edit buttons were removed.
- Audit fields are required except “Extra beyond standard”.
- Selecting a school already used by another activity shows a dismissible orange warning toast.
- Furniture/equipment items use a compact editor plus table instead of endlessly duplicating full forms.
- Required item fields are visually marked and incomplete items block Continue.
- Learner counts are locked only when a value exists; empty values remain editable.
- Fixed several production-only navigation failures by using real links/navigation rather than fragile client-only click behavior.
- Plan title is shown as `<year> · <quarters> BEAP`, not “action plan”.
- Workspace branding is `<STATE> SUBEB`; FCT is `FCT UBEB`.
- Admin workspace has Users first, then Workflow settings, then Activity; platform settings are global.
- Login uses a full-page UBEC education-photo slideshow with soft image transitions, overlaid login card, HOPE-site identity link, and a custard orbit/glow on the login button. Videos were intentionally abandoned in favor of images.

## Critical production incident and permanent fix

After the production reset, creating a plan failed with:

`null value in column "funding_policy_id" of relation "action_plans" violates not-null constraint`

Cause: `TRUNCATE users ... CASCADE` also truncated `funding_policies` because PostgreSQL follows foreign-key dependencies during `TRUNCATE ... CASCADE`, even when the FK uses `ON DELETE SET NULL`.

Fixes in commit `e43ed57`:

- `scripts/seed-production-users.mjs` restores the baseline funding policy when the table is empty.
- `app/api/plans/route.ts` explicitly reads and pins the latest funding policy and returns a clear `409` configuration error if none exists.

Production was repaired and verified by creating a real plan through `POST /api/plans` with a valid generated XLSX (`201`), then deleting only that temporary test plan.

## Reset-safety audit

The user asked for a proactive check for similar post-reset failures.

The audit found and fixed another reset-sensitive platform record:

- `state_workflow_settings.updated_by` references `users(id) ON DELETE SET NULL`.
- The production reset used `TRUNCATE users ... CASCADE`, so PostgreSQL likely truncated `state_workflow_settings` just as it truncated `funding_policies`.
- Runtime reads safely fall back to `complete_plan`, and the admin save action recreates the row, so the portal may appear functional; however, the durable `GLOBAL` row should be restored by the nationwide seed to avoid silent configuration loss.
- An idempotent insert was added to `scripts/seed-production-users.mjs`:
  `INSERT INTO state_workflow_settings(state_code,beap_chair_submission_mode) VALUES ('GLOBAL','complete_plan') ON CONFLICT (state_code) DO NOTHING`
- Migration `025-restore-required-settings.sql` restores a missing global row in existing deployments while preserving configured values.

Then audit production/reference integrity:

- Expected nonempty durable tables: `users`, `schools`, `funding_policies`, `state_workflow_settings`, `schema_migrations`.
- Check `construction_types`; it may legitimately be empty on a fresh system because types are state-defined.
- Confirm `funding_policies >= 1` and exactly one `state_workflow_settings` row with `state_code='GLOBAL'`.
- Inspect every FK referencing `users` or `action_plans` before any future reset. Never assume `ON DELETE` behavior protects a table from `TRUNCATE ... CASCADE`.
- Search APIs for required reference records read via `rows[0]`, `LIMIT 1`, or scalar subqueries and ensure absence produces a clear error or safe baseline.
- `app/api/funding-policy/route.ts` now returns a clear configuration error instead of dereferencing a missing latest policy.
- Check fresh logins and page/API access for all four state roles plus Super Admin and UBEC Executive Secretary.
- Exercise with temporary records and delete only the records created by the test.

## Safer reset guidance

- Do not repeat a broad `TRUNCATE users ... CASCADE` without first listing dependent tables and classifying configuration versus transactional data.
- Prefer an explicit reset script or explicit table list that preserves reference/configuration rows.
- If a clean nationwide demo reset is required, back up first, clear only intended user/plan/transactional data, run all migrations, run `scripts/seed-production-users.mjs`, then assert required baseline counts before exposing the portal.
- The nationwide seed is transactional and refuses to overwrite existing seeded emails.
- The seed currently restores a missing funding policy; it should also restore the global workflow setting as described above.

## Important commits

- `ee75a2f` — multi-department state users and nationwide seed.
- `199a8b0` — include nationwide seed runner in the production image.
- `e43ed57` — restore funding policy during production seed and guard plan creation.
- `def5183` — remove login slideshow footer content.
- `de1d5ba` — use login photos with a soft crossfade slideshow.

## Dashboard funding semantics

- `fundingTotal` is the funding envelope entered at plan creation: state contribution twice (state plus UBEC match) plus other funding.
- `budget` is the sum of saved activity/project lines and can legitimately be zero on a new plan.
- The dashboard hero must show **Total plan funding** from `fundingTotal` so a newly created plan immediately displays its funding.
- Plan cards show **Available funding** and separately report the amount already proposed in activity lines.
- The investment breakdown continues to use activity-line proposals; do not treat unallocated funding as spending.

## UX expectations from the user

- Keep language plain and role-specific. Buttons should name the actual recipient, e.g. “Send to BEAP Chair” and “Send to Executive Chairman”.
- Prefer shadcn components and established page patterns.
- Dashboard-style grid background and header spacing should remain consistent across pages.
- Avoid redundant cards and excessively wide controls.
- Table rows themselves should be actionable when that is the established interaction.
- Validate required fields visibly and block progression when data is incomplete.
- Do not push until asked when the user explicitly says to stop pushing; otherwise recent instructions have authorized pushing completed production fixes.

## Definition of done for the current audit

1. Restore/protect every required configuration row found missing after the reset.
2. Add defensive API handling for missing configuration where appropriate.
3. Run lint and production build.
4. Commit and push the fixes.
5. Wait for the Dokploy deployment to complete successfully.
6. Verify `/api/health` and non-destructive role/API smoke tests on production.
7. Report exactly what was found, fixed, and verified.
