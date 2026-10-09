# BEAPMS project handoff

Last updated: 4 October 2026 (Africa/Lagos)

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
- API/unit tests: `node scripts/run-tests.mjs [baseUrl]` runs every `scripts/test-*.mjs` one after another against a running local server (they share the local database, so never run them in parallel), loading the repository `.env` (`--env-file=path` or `TEST_ENV_FILE` to override; `--only=sports,plan-setup` for a subset). It prints PASS/FAIL per script plus a summary and exits non-zero on any failure. Every test script takes `[baseUrl]` as its first argument, else `TEST_BASE_URL` / `UBEC_TEST_URL`, else `http://localhost:5173`; tests that change GLOBAL workflow settings restore them in `finally`.
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
- 13 non-state users: one Super Admin, one UBEC Executive Secretary, and 11 UBEC department reviewers. After migration 055 and `scripts/seed-ubec-users.mjs --yes` the UBEC side becomes 23 active accounts (ES, BEAP Chair, 7 Directors, 3 Oversight Directors, 11 Assessment Officers); not yet run on production.
- Total expected users: 161.
- Schools: 79,848 directory records across all 37 states (28 September 2026). Pending: these and all plans are to be purged and replaced by the DNEMIS import (see "DNEMIS school sync").
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

Implemented blocking components (`implementedPillars` in `lib/beap-pillars.ts`): Infrastructure, TLM, Sports, SBMC, Supervision & Monitoring (`monitoring`), Greening Schools, Climate Change & Safeguards (`gscci`), Curriculum (`curriculum`), Quality Assurance (`quality`), Teacher Development (`teachers`), ICT (`ict`) and Planning, Research & Statistics (`planning`), see the sections below. Every policy component is now implemented (no placeholders remain). The SBMC/TLM activity editor (`components/activity-plan-editor.tsx`, `lib/activity-plans.ts`, `activity_plan_lines.workstream`) also drives the three newer components (migration 036): Monitoring has optional Proforma Invoice uploads (`component_documents`, `app/api/activities/documents/route.ts`); Curriculum has per-activity caps (60/20/10/10% of its envelope) and a distribution list (`tlm_distribution.workstream = 'curriculum'`).

GSCCI activities (migration 039, `activityNames.gscci`): UBEC's new list of nine, indexes 0-8: GSCCI Pillars 1-6 (greening schools/planting of trees; entrepreneurial greening curricula; teacher training and education system capacity; greening communities; national greening competitions; Green Clubs), rearing of small animals/aquatic farming, safeguards and waste management initiatives, and supervision and monitoring of GSCCI initiatives. Line form unchanged, no uploads, envelope ceiling as before. Migration 039 copied the old GSCCI lines to `retired_gscci_lines`, deleted them and reset GSCCI reviews to draft for plans not with UBEC (same pattern as 037 for SBMC); UBEC round snapshots are untouched.

Distribution lists (`lib/distribution-lists.ts`): TLM, Curriculum and GSCCI each have a required school list in `tlm_distribution` keyed by workstream (snapshot fields `tlmDistribution`, `curriculumDistribution`, `gscciDistribution`; workbook sheets `distribution`, `curriculumDistribution`, `gscciDistribution` "Greening distribution", all commentable). A component with an empty list cannot be sent at any step (`app/api/plans/review/route.ts`, `nothingToSend` in `app/beap/review/page.tsx`) and blocks complete-plan readiness (`lib/pillar-review.ts`). Distribution schools count in plan school totals (`lib/plan-summary.ts`, UBEC dashboard). Test: `node scripts/test-activity-components.mjs [baseUrl]`.

## Plan page (one page per plan)

`/beap/review?plan=N` is the single plan page for every state role; the old pillar overview `/beap?plan=N` only redirects there (client-side `location.replace`, keeping the query and hash). Dashboard plan cards, plan creation, notifications, Recent activity, pending actions and every editor's back/Done link point at `/beap/review`.

- Top to bottom: Dashboard back link; title, status, version picker, Edit plan (`EditPlanDialog`, shown when `GET /api/plans/setup` says `allowed`), View UBEC review (locked plans); change-request and saved-submission alerts; summary card (`components/plan-page/plan-summary.tsx`: available funding, component-coloured tick gauge, pills for schools/lines/other funding/implementation year, folded "Funding details & documents" = `PlanSetupSummary`); compact component cards (`component-cards.tsx`); BEAP Chair / Executive Chairman bar (`workflow-bar.tsx`); the workbook (`PlanReviewContent`) and Review history (`review-history.tsx`). The send/request-changes dialog is `review-action-dialog.tsx`; styles in `components/plan-page/plan-page.css`.
- Component card: the original illustration (`PillarIllustration` / `InfrastructureIllustration`, 72px) on its tinted wash (peach/sage/lilac), status, open SUBEB/UBEC comment chips, proposed amount against `componentEnvelope` (bar turns red over the ceiling), and a small policy-share pill by the department ("5% share"; shared ones "75% shared with TLM", "5% shared with ICT"; tooltip "Share of the plan's funding for this component (funding policy)", from `policyShare` and the pinned policy). Ceilings and shares use the loaded snapshot's `setup` when present, so a saved submission shows its own. Infrastructure and TLM cards show "₦X of ₦pool · ₦Y left" and a two-part bar (own part, then the partner's in a lighter tint). Hover/focus expands a card in place (transform `scale(1.075)` + shadow, z-index held until the shrink ends; reduced motion: shadow only), so no neighbour moves. The card opens the editor when `mayEditPillar` allows it (with a small "View in the workbook" icon), otherwise its sheet (`#review-<pillar>`). The workflow step the viewer holds (Send to Director / BEAP Chair / Executive Chairman) sits on the card; Send to Director is hidden while the component has nothing saved.
- Figures come from the loaded snapshot via `summarizeSnapshot` (`lib/plan-summary.ts`, also used by `GET /api/beap`), so a selected saved submission shows its own amounts. The gauge, `Amount` and pills are shared with the dashboard plan card (`components/dashboard/plan-figures.tsx/.css`).

## Stage-gated visibility (no migration)

People see a component's details only once it has been sent to them. `canViewComponent` (`lib/subeb-access.ts`) stays the role/department ceiling; `lib/stage-visibility.ts` adds the workflow gate on top.

- Levels: 0 Data Entry, 1 department Director, 2 BEAP Chair, 3 Executive Chairman. `reachedLevels(events, reviews)` replays `plan_review_events` in order (`submit` → 1, `endorse` → 2, `forward` → 3, the collated `forward` moves every component at 2, a return goes one level down, a UBEC return to 0) and takes the max with the current `plan_pillar_reviews` status, so a component stays visible after a return for changes.
- Required level (`requiredLevel`): Data Entry Staff 0 (their departments); Director 1 (their departments); BEAP Chair 1 for their own departments, 2 for the rest; Executive Chairman 3. UBEC is unchanged (round snapshots only).
- `readStageVisibility(db, user, planId, submission?)` returns the visible components for the working plan, or for a saved submission only what had reached the viewer by then (events up to that number). `readSubmissionVisibility` (version picker) and `readStateStageVisibility` (dashboard) do the same for many submissions/plans. `visibleSnapshot(snapshot, visible)` (`lib/plan-visibility.ts`) now takes that list.
- Applied in: plan review GET (`visiblePillars` = details; `pillarReviews` = every status under the ceiling; component history entries and saved submissions only once visible; a hidden submission is 404), `/api/beap`, `/api/plans` (budgets, line and school counts, targeted schools and Recent activity count only visible components; hidden ones read 0), `/api/plans/setup` GET `proposed`, the editor GETs (`/api/activities`, `/api/sports`, `/api/infrastructure/packages`: 403 "not been sent to you yet"), comments (GET returns threads only on visible components; replies/resolve/reopen on hidden ones are 404), and the component, line and infrastructure document downloads (404). Writes are unchanged: holders always see what they hold.
- Plan page: a component card the viewer cannot see yet shows its name, department, policy share and status with "Details appear once it is sent to you" (no amounts, bar, comment chips or link); the workbook has no sheet for it.
- Not filtered: notifications (they only go to the level that receives the component, plus general UBEC returns) and pending actions. The plan setup PATCH may still name a hidden component in its shortfall refusal.
- Test: `node --env-file=.env scripts/test-stage-visibility.mjs [baseUrl]` (throwaway state, users and plan; cleans up).

## Quality Assurance and ICT (migration 038)

Two more activity-line components on the shared editor (`components/activity-plan-editor.tsx`, with their own fields in `components/activity-line-extras.tsx`); pages `/beap/quality` and `/beap/ict`.

- Quality Assurance: component `quality`, state department `me` (Monitoring & Evaluation), UBEC lead department `quality`, 5% policy share. Eleven activities (`qualityActivityNames` in `lib/activity-extras.ts`); activity 0 (Mobility and Office Equipment) requires `equipment_type`. Info hints in `activityInfo` (`lib/activity-plans.ts`). Optional line supporting documents only (migration 057).
- ICT: pillar `ict` (state department `ict`, UBEC lead `teachers`) inside the `teachers` component, reviewed on its own like TLM inside Infrastructure. Nine activities. Extras: activity 5 `subscription_types` (Starlink, MTN/Airtel/Glo/T2 grouped as "Mobile network (MNO)", Fibre; at least one), activity 6 `website_type`; activities 2, 4 and 8 choose schools from the state's register (`activity_line_schools`, at least one, own state only); activities 0, 3 and 4 take documents (`activity_line_documents`), required only while the Supporting documents setting is on (see below).
- ICT allocation: ICT and Teacher Development share the `teachers` envelope (policy share of state contribution ×2 + legacy other funding + `teachers` funding sources = `teachersSharedEnvelope`). The ICT editor first asks how much ICT will use (`action_plans.ict_allocation`, `PATCH /api/activities/budget-split` or the older `/api/activities/ict-allocation`, `lib/budget-pairs.ts`): 0 < amount ≤ shared envelope and not below the ICT lines. `componentEnvelope(plan, 'ict')` is the allocation (null until set, which blocks ICT lines); `componentEnvelope(plan, 'teachers')` is the remainder for Teacher Development. Plan edits that would shrink the shared envelope below the allocation are refused (`sharedBelowAllocationProblem` in `lib/budget-pairs.ts`, re-exported from `lib/plan-setup.ts`, also shown in the edit dialog).
- Typed types (migration 048): equipment type, website type and subscription types list suggestions plus "Others (specify)", which shows a text box; the typed name is stored as the value (trimmed, up to 100 characters; at most one typed subscription). The DB checks only shape and length.
- Budgets: both are capped components (`cappedWorkstreams`); ICT activity 2 (Maintenance of Model Smart Schools) is also capped at ₦30,000,000 for all its lines (`activityFixedCaps` in `lib/activity-budget.ts`), client and server side.
- Compulsory activities (`compulsoryActivities`): Quality Assurance 2, 3, 6, 7, 8, 9, 10; ICT 2, 3, 6. Lines can be saved in any order, but every send step (`submit`, `endorse`, `forward`, the collated BEAP Chair send via `readyForExecutiveChairman`, and the UBEC submission) is refused with 409 and the missing list until each has a line, every school-choosing line has schools and every document line has a document (`componentReadinessProblem` in `lib/component-readiness.ts`). The editor shows a "Required" badge and a checklist; the plan page disables the card's send button with the reason.
- Uploads (`app/api/activities/line-documents/route.ts`): PDF, XLS, XLSX only (extension and signature; an XLSX must contain `xl/workbook.xml`), 5 MB, 10 per line, attached to a saved line; removal is soft and deleting a line soft-removes its documents. Downloads follow the component documents rules (state viewers of the component; UBEC viewers who can see that component of a round containing the document, `ubecSeesPillarSql`). Other upload types elsewhere are unchanged.
- Snapshot lines of `quality`/`ict` carry `schools` and `documents`; the workbook sheets show Equipment type (QA) and Details/Schools/Documents (ICT) with expandable rows listing schools and download links. Dashboard palette, `InvestmentArea`, `mixOrder` and `/api/plans` (`qualityBudget`, `ictBudget`) include both.
- Test: `node --env-file=.env scripts/test-quality-ict.mjs [baseUrl]` (throwaway states, users and plan; cleans up).

## Teacher Development (migration 040)

Teacher Development is pillar `teachers` (state department `teachers`, UBEC lead `teachers`): the first section of the shared `teachers` component, reviewed on its own like ICT. Editor `/beap/teachers` (the shared activity editor with `components/teacher-training-fields.tsx`); constants in `lib/teacher-development.ts`, field validation in `lib/teacher-training-schema.ts`.

- Nineteen activities (0-18, `teacherActivityNames`); 18 "Others (specify)" needs a custom name; 10 (TELT) has an info hint. No compulsory activities yet (`compulsoryActivities.teachers` is empty; the plumbing is there).
- Lines replace Strategy/Target group with: training provider, target participants, school levels (at least one of ECCDE/Primary/JSS/SUBEB; SUBEB since migration 054), training days (whole number, at least 3), venue type, quantity (participants) × unit cost per teacher. Description is optional; `strategy`/`target_group` stay '' on these lines (the schema requires them only for other workstreams). Columns `training_provider`, `target_participants`, `school_levels`, `training_days`, `venue_type` on `activity_plan_lines`, with CHECKs, including one that every `teachers` line has them all and no other line has any.
- Every line takes supporting documents (PDF/Excel, `activity_line_documents.component = 'teachers'`, same upload route and rules as ICT), required only while the Supporting documents setting is on (see below). Readiness (`componentReadinessProblem(..., setup, { documentsRequired })`) also needs the budget split set; every send step and the complete-plan checks use it.
- Shared budget split: one stored figure, `action_plans.ict_allocation`; Teacher Development keeps shared − ICT. Both editors show `components/shared-budget-panel.tsx` first; `PATCH /api/activities/budget-split` (also served at `/api/activities/ict-allocation`) takes `{ amount, side: 'ict' | 'teachers' }` (`sharedSplit` in `lib/budget-pairs.ts`, which also drives the Infrastructure & TLM split; a Teacher Development amount is stored as shared − amount). Each side needs edit rights on its own component; the amount is > 0 and ≤ shared, not below its own lines, and leaves the other side at least its lines. ICT may be left ₦0 (CHECK now `>= 0`) only while it has no lines. Teacher Development lines are refused until the split is set (`componentEnvelopeKobo` is null for `teachers` until then); `GET /api/activities` returns `partnerProposed` for both sides.
- Workbook sheet `teachers` (columns activity, provider, participants, school level, days, venue, qty, unit cost, amount; rows expand to the description and documents), comments, UBEC review/dashboard, `/api/plans` `teachersBudget`, palette, filters, notifications ("Teacher Development").
- Test: `node --env-file=.env scripts/test-teacher-development.mjs [baseUrl]` (throwaway state, users and plan; cleans up).

## Planning, EMIS & Data Platform (migration 041; formerly "Planning, Research & Statistics")

Pillar and component `planning` (state department `planning`, UBEC lead department `planning`, 2% policy share), on the shared activity editor at `/beap/planning`; workstream `planning`. It follows Quality Assurance: the base line form (Description, Qty, Implementation strategy, Target group, Unit cost, Sub-total), several lines per activity, optional supporting documents only (migration 057), no schools, capped at its envelope (`cappedWorkstreams`).

- Six activities (0-5, `planningActivityNames` in `lib/activity-extras.ts`): annual school census; develop SMTBESP; review and track SMTBESP; capacity building of EMIS, ICT and PRS Officers; working tools and ICT resources for PRS Officers; technical assistance for planning. Info hints on 0, 1, 3, 4, 5 (`activityInfo.planning`).
- Compulsory (`compulsoryActivities.planning`): 0, 2, 3, 5. Same rule as QA (`readinessWorkstreams` includes `planning`): every send step and the complete-plan checks are refused with 409 and the missing list until each has a line.
- Plumbing: snapshot `planning`, visibility, UBEC submission snapshot and reviewer view, workbook sheet `planning` (activity columns, `ChartColumn` icon) and comments (`commentSheets`/`commentColumns`), UBEC dashboard, `/api/plans` `planningBudget`, dashboard palette/filter/gauge (`componentPalette.planning`, `InvestmentArea`, `mixOrder`), notifications/recent activity ("Planning"), plan page card (systems illustration).
- Migration 041 widens the `activity_plan_lines` workstream/activity, `plan_pillar_reviews`, `plan_comments` pillar/sheet and `plan_funding_sources` component CHECKs (additive, idempotent).
- Test: `node --env-file=.env scripts/test-planning.mjs [baseUrl]` (throwaway state, users and plan; cleans up).

## Line timeline (migration 050)

Every component line has a **Timeline**: the quarters it is implemented in. `quarters SMALLINT[] NOT NULL` on `activity_plan_lines`, `sports_budget_lines` and `infrastructure_packages` (CHECK `beapms_valid_quarters`: 1-4 values, each 1-4, no repeats/NULLs). Rules in `lib/line-quarters.ts`, DB helpers in `lib/line-quarters-db.ts`.

- UI: `components/quarter-timeline.tsx` (`QuarterTimeline`, the shadcn ToggleGroup Q1–Q4 picker, CSS in `quarter-timeline.css`; also used by the Create and Edit plan dialogs, with `locked` = quarters of another plan) and `QuarterBadge` for saved lines. Line forms use `size="compact"` with `available` = the plan's quarters (others locked). A new line starts with all of the plan's quarters (`planQuarters`; a legacy plan without quarters = Q1–Q4). Shown in: the shared activity editor (SBMC, TLM, Monitoring, GSCCI, Curriculum, QA, ICT, Teacher Development, Planning), the sports budget form and preview, the infrastructure package School step and the Saved packages table, and a `timeline` "Timeline" column on every line sheet of the workbook (`components/plan-workbook/sheets.tsx`, `commentColumns`). `formatQuarters` (`lib/format-quarters.ts`) prints `Q1–Q3` / `Q1, Q3`.
- Validation: `lineQuartersSchema` in `activityLineSchema`, `sportsLineSchema` and `packageSchema` (non-empty, 1-4, no repeats); the APIs check the subset of the plan's quarters after `mutatePlan`'s plan lock (`resolveLineQuarters` + `readPlanQuarterSetup`), 400 otherwise. Backward compatibility: the field is optional in the payload; a save without `quarters` gets the plan's quarters (API) and a DB trigger fills a missing value the same way. An empty list is refused.
- Snapshots: activity and sports lines carry `quarters` (`SELECT *`/`to_jsonb`); infrastructure items carry `quarters` (column, also kept in the package `input`). Older submissions have none (blank Timeline cell).
- Plan edits (`app/api/plans/setup/route.ts`, `components/edit-plan-dialog.tsx`): removing a quarter that lines use is refused with 409 ("N lines use Q3 in their timelines…", `quarterRemovalProblem`); GET returns `quarterUsage` so the dialog shows it first.
- Migration 050 backfilled every existing line with its plan's quarters (idempotent).
- Test: `node --env-file=.env scripts/test-line-quarters.mjs [baseUrl]` (throwaway state, users and plan; cleans up).

## Others (specify) activities (migration 047)

Every activity-line component ends its list with an Others activity whose lines name their own activity (`activity_plan_lines.custom_activity`, field "Activity name"): SBMC 16, Supervision & Monitoring 4, GSCCI 9, Curriculum 4, Quality Assurance 11, ICT 9, Planning 6 (`othersActivityName`), plus the existing TLM 22 "Other TLMs" and Teacher Development 18. Always appended last, so earlier indexes keep their meaning.

- `otherActivityIndex` / `isOtherActivity` and `activityLabel(workstream, index, customActivity)` in `lib/activity-plans.ts`; the label is used by the editor, the workbook (state and UBEC) and search. The name is required (trimmed, up to `maxActivityNameLength` = 160) on an Others line and must be empty on every other line, in the zod schema and in the DB CHECK `activity_plan_lines_custom_activity_check` (TLM 4, the retired "Others", may have either). Migration 047 also widens `activity_plan_lines_activity_check`; the custom-name CHECK is added NOT VALID and then validated (a warning leaves it NOT VALID if older rows break it).
- Others is never compulsory, has no activity cap (Curriculum Others sits outside the 60/20/10/10 split and only counts toward the Curriculum ceiling; its workbook share cell is blank) and takes no activity extras; Teacher Development Others still needs its training fields and documents like every Teacher Development line.
- Sports already covers this with free text (type another sport or item, except the listed-only Basketball items) and its "Other Competitions"/"Others" sub-activities, whose description names the activity. Infrastructure deliverables follow UBEC's typology; furniture/equipment items are free text.
- Test: `node --env-file=.env scripts/test-activity-others.mjs [baseUrl]` (throwaway state, users and plan; cleans up).

## Supporting documents setting (migration 052)

- `state_workflow_settings.component_documents_required` (GLOBAL row, default FALSE = optional), Super Admin section "Supporting documents" on Admin > Settings (`/admin?section=documents`, `components/admin-settings/simple-panels.tsx`, API `app/api/admin/component-documents/route.ts`, GET/PUT `{ required }`, same origin). Read with `readComponentDocumentsRequired` (`lib/component-documents-setting.ts`), which falls back to optional when the row or column is missing.
- Governs the document uploads below (not the optional line supporting documents of migration 057): the ICT documents (activities 0, 3, 4), the Teacher Development supporting documents, and the Infrastructure BOQ and geophysical survey report of each school, Whole School photographic evidence (the rule tied to non-functional general classrooms, `photoEvidenceRequired`) and the updated BOQ needed to re-save a Whole School package. Monitoring proforma invoices were already optional.
- When off (Optional): uploads stay available but nothing is refused for a missing one. `componentReadinessProblem(..., { documentsRequired: false })` and `infrastructureDocumentProblem(snapshot, { documentsRequired })` skip them at every send step (submit/endorse/forward, the collated BEAP Chair send and `planIsComplete`, Executive Chairman → UBEC via `readyForUbecSubmission`) and on the plan page cards; `POST /api/infrastructure/packages` skips the photo and updated-BOQ checks; the editors label the fields "(optional)" and drop the required marks, the "… needed" badges and the "Updated BOQ required" notice. When on (Required), behaviour is as before. `GET /api/activities`, `GET /api/infrastructure/packages` and `GET /api/plans/review` return `documentsRequired`.
- Infrastructure plan drawings are no longer collected in either mode: the editor has no Drawings upload and nothing requires them (save, send, readiness). `POST /api/infrastructure/documents` refuses `kind=drawings` with 400 "Plan drawings are no longer collected for Infrastructure." Drawings uploaded earlier stay listed (editor "Earlier drawings", removable while editable), in snapshots, the workbook and the UBEC view, and downloadable.
- Never affected (always required): the RAT upload at plan creation (`lib/plan-upload.ts`, `components/create-plan-dialog.tsx`) and the Infrastructure New Construction "Land declaration & agreement" section (at least one declaration ticked, one land document per ticked declaration; packages save and send step).
- Test: `node --env-file=.env scripts/test-documents-required.mjs [baseUrl]` (ICT, Teacher Development and Infrastructure in both modes, land documents and the RAT always required); `test-quality-ict.mjs`, `test-teacher-development.mjs` and `test-infrastructure-packages.mjs` switch the setting on for their run and restore it.

## Line supporting documents (migration 057)

Every line of SBMC, TLM, Supervision & Monitoring, Curriculum, Quality Assurance, ICT (the activities without a governed document) and Planning takes optional **Supporting documents** in `activity_line_documents` (component CHECK widened by `db/postgres/057-line-supporting-documents.sql`). Sports and Greening (GSCCI) take none (the upload route's workstream enum refuses them, and the CHECK keeps `gscci` out). Infrastructure keeps its own document set.

- Rules in `lib/activity-extras.ts`: `requiredLineDocumentLabel` = the documents the Supporting documents setting governs (ICT 0/3/4, Teacher Development); `isSupportingDocumentLine` = the optional ones (`supportingDocumentWorkstreams`, label `supportingDocumentLabel`); `lineDocumentLabel` = either, or null.
- Always optional, whatever the Super Admin setting: `componentReadinessProblem` checks only `requiredLineDocumentLabel`, the panel's "… needed" badge too, and the editor labels the field "Supporting documents (optional)". **Open decision:** whether these should follow the Required setting later was not asked; today they never block saving or sending.
- Files (`lib/line-document-upload.ts`, `app/api/activities/line-documents/route.ts`): supporting documents take PDF, XLS, XLSX, DOCX (must contain `word/document.xml`), PNG and JPG/JPEG (extension and signature); the governed ICT/Teacher Development documents stay PDF/Excel only. 5 MB, 10 per line, attached to a saved line (pending files upload after the line is added), soft removal, downloads as before (stage-gated for the state, round snapshot + `ubecSeesPillarSql` for UBEC).
- UI: `LineDocumentsField` under the line form (`components/activity-line-extras.tsx`, accept list from `lineDocumentAcceptFor`); the saved-lines panel shows a paperclip count on every line with documents (`PanelLine.attachments`, `components/line-panel/line-table.tsx`); every activity sheet but Greening expands rows that have documents to list them with download links (`components/plan-workbook/sheets.tsx`, `line-extras-detail.tsx`), on the plan page and the UBEC view.
- Snapshots (`lib/plan-snapshot.ts`): SBMC, TLM, Monitoring, Curriculum and Planning lines now carry `documents` (and `schools: []`) like QA/ICT/Teacher Development; older submissions have none.
- Test: `node --env-file=.env scripts/test-line-supporting-documents.mjs [baseUrl]` (throwaway state, users and plan; turns the Required setting on for its run and restores it). `test-quality-ict.mjs` now expects QA and other ICT lines to accept documents.

## Line reference codes (migration 053)

- Every budget line has a code like Sports lines (`UBEC/SUBEB/SPORT/066/2026 · Q1–Q4`): `activity_plan_lines.code` = `UBEC/SUBEB/<SBMC|TLM|MON|GSCCI|CURR|QA|ICT|TD|PRS>/<id, 3+ digits>/<plan period>`, `infrastructure_packages.code` = `UBEC/SUBEB/INFRA/...`. BEFORE INSERT triggers set it (`beapms_line_code`, `beapms_plan_period` mirrors `planPeriod()`), so save routes need nothing; it never changes afterwards. Shown in the workbook (Code column on every activity sheet and Teacher Development; Infrastructure already had one) and under each saved line in the editors. Snapshots carry it (`SELECT *`).

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
- Test: `node scripts/test-plan-comments.mjs [baseUrl]` (default `http://localhost:5173`) creates throwaway states, users and a plan, then removes them.

## UBEC review flow (migration 055)

Design: `docs/ubec-flow.md` (state machine, permission matrix, API, UI map). Replaces the earlier ES-assigns-departments flow.

- Roles (`lib/ubec.ts` `ubecRoles`): `UBEC BEAP Chair` (releases a submitted round with a required comment, then approves or returns it), `UBEC Director` (one component department; assigns Assessment Officers with a comment, sends each component for oversight with a comment, adds officers on `/ubec/team`), `UBEC Oversight Director` (`audit`/`procurement`/`finance`; sees components once sent for oversight, comments, clicks **Observations done**, never accepts/rejects), `UBEC Assessment Officer` (replaces `UBEC Department Reviewer`; accepts/rejects each item of assigned components, then **Complete assessment**), `UBEC Executive Secretary` (supervisory, read-only: sees everything incl. internal comments, no workflow actions or comment writes; still edits Allocations). Any active user holding the role and department can act for it; the admin API keeps one active BEAP Chair, one Director per department and one Oversight Director per oversight department. `UBEC Department Reviewer` stays in the role CHECK as a legacy value with no access.
- Departments to components (`pillarDepartments`): `physical` DPP: infrastructure, monitoring; `planning` DPRS: planning; `academic` DACS: sports, tlm, curriculum, gscci (TLM keeps the Infrastructure budget pool but DACS reviews it); `teachers` DTPD: teachers; `digital` DDDPA: ict; `quality` DME: quality; `social` DSM: sbmc. `administration`/`special`/`zonal` are legacy names only.
- Schema (`db/postgres/055-ubec-review-flow.sql`): `ubec_rounds.released_at/released_by_name/release_comment`; `ubec_events.pillar`; `ubec_round_components` (stage `director` -> `oversight` -> `chair`, Director comment, timestamps; cascades with the round); `ubec_officer_assignments` (officer, assigning Director, required comment, `completed_at`, `completion_note`, soft `removed_at`); `ubec_item_decisions` (one accept/reject per round + component + row_ref, note, officer); `ubec_oversight_reviews` (one per component and oversight department). The migration turns reviewers into Assessment Officers (audit/finance reviewers into Oversight Directors) and moves open earlier-flow rounds back to `received`; their `ubec_assignments` stay readable as "Earlier department reviews".
- Flow: EC submits (submission modes unchanged; needs an active UBEC BEAP Chair) -> round `received` -> chair `release` (one component row per populated component, round `reviewing`) -> Director `assign_officers` -> officers decide every item (`PUT /api/ubec/decisions`) and `complete_assessment` (409 while any item is undecided; decisions then lock) -> Director `send_oversight` (needs at least one officer, all complete) -> Audit, Procurement and Finance `observations_done`; the third moves the component to `chair` automatically -> chair `approve` (409 while anything is rejected/undecided) or `return` (whole plan; every component back to `changes_requested`; ticked UBEC threads shared). Both decisions need every component at `chair`. Resubmission opens the next round in `received`; `flow.previousDecisions` shows the previous round's item decisions by row id.
- Visibility (`lib/ubec-flow-db.ts` `ubecSeesPillarSql`/`viewerPillars`, also used by every document download route): ES and chair all; Director their department's components once released (plus legacy assignments); Oversight once sent for oversight; officer their live assignments. A viewer sees a round only with at least one visible component; snapshots are filtered (`ubecVisibleSnapshot`).
- APIs: `app/api/ubec/review` (GET detail with `flow`; POST `submit`/`release`/`approve`/`return`, plan `version` checked), `app/api/ubec/components` (POST `assign_officers`/`unassign_officer`/`complete_assessment`/`send_oversight`/`observations_done`), `app/api/ubec/decisions` (PUT), `app/api/ubec/dashboard` (role-aware items with per-component pipeline, `queue`, workload, activity), `app/api/ubec/officers` (GET/POST for a Director's own department or the chair), `app/api/ubec/results` (SUBEB view of the latest decided round, filtered by the state user's departments). Every write: same origin, user re-read `FOR SHARE`, plan row lock then round/component `FOR UPDATE`, stage checks with 409.
- UI: `/ubec` role dashboards (queue card, SUBEB-style plan cards `components/ubec/ubec-plan-card.tsx`, national overview for ES/chair, submissions table, workload, activity); `/ubec/review?plan=` plan page (`components/ubec/*`: component cards with stage pill, cost and % of plan, decision bar, officers, oversight chips; chair bar; item assessment table with Accept/Reject/View/Comment; `FlowDialog` for every step); `/ubec/team`; SUBEB plan page "UBEC assessment" card (`components/plan-page/ubec-results.tsx`). Illustrated empty states in `components/empty-art/ubec-flow.tsx`. The account menu shows e.g. "UBEC Director · Physical Planning (DPP)" (`ubecRoleTitle`).
- Accounts: `scripts/seed-ubec-users.mjs` (dry run by default; `--yes` applies; `--production-confirmed` for a non-local DB; needs `SEED_SHARED_PASSWORD`, never printed) makes the active UBEC side exactly 1 ES (existing kept), 1 BEAP Chair, 7 Directors, 3 Oversight Directors and 11 Assessment Officers (`beap.chair@ubec.test`, `<dpp|dprs|...>.director@ubec.test`, `<audit|procurement|finance>.director@ubec.test`, `<component>.officer@ubec.test`); every other UBEC-side account is deleted when no foreign key references it, else deactivated with sessions revoked. Copied into the production image.
- Tests: `scripts/test-ubec-flow.mjs` (whole chain and permission matrix), `scripts/test-ubec-review.mjs`, `scripts/test-ubec-comments.mjs`.

## UBEC Assessment Officers: limits and defaults (migration 056)

- Admin > Settings > **UBEC Assessment Officers** (`/admin?section=officers`, `components/admin-settings/officers-*.tsx`, API `app/api/admin/ubec-officers/route.ts`, Super Admin only, PUT needs the same origin, takes the `admin:user-management` advisory lock). A table, one row per component department: code badge, components (count, tooltip lists them), active officers "n of limit" with a meter (amber over the limit), the limit (− / + stepper, "Default N · Reset"); expanding a row lists its components with the default officer(s) as avatar chips (short label without the "UBEC Assessment Officer – " prefix, full name in a tooltip) and a Popover/Command multi-select; empty = "Director assigns". Illustrated empty state when a department has no officers. Below it "Plans in department assessment" links the Super Admin to `/ubec/review?plan=`.
- `ubec_officer_limits(department, max_officers 1-50)`: no row = default = one per component (`defaultOfficerLimit`: Physical Planning 2, Academic Services 4, others 1). `lib/ubec-officer-limits.ts` `officerLimitProblem` is checked under the user-management lock by `POST /api/ubec/officers` and Admin > Users create/edit (role change to officer, reactivation, department change); 409 with its message. Lowering below the active count is allowed; GET returns `warning` ("3 active, limit 2: no new officers until one is deactivated"). `/ubec/team` shows "x of y officers" per department and disables Add (with the reason) when full; full departments are disabled in the chair's department select.
- `ubec_default_officers(pillar, officer_id)`: PUT validates officers are active Assessment Officers of `pillarDepartments[pillar]`. Admin > Users edits call `pruneDefaultOfficers` (deactivated / other role or department drop out); release also ignores rows that no longer qualify. On **release** (`app/api/ubec/review`), inside the transaction, `assignDefaultOfficers` inserts assignments (`assigned_by_name` 'Default (Admin)', comment 'Assigned by default (Admin)', `assigned_by_id` = the releasing chair), one `default_officers` event per component, bell to the officers and the department Director. The Director can still add/remove/change them.
- Super Admin reassign: `GET /api/ubec/review` lets the Super Admin read every round (`seesEverything`), `flow.abilities.assign` = every component at stage `director`, `flow.officers` = active officers of all released departments (with `department`; the picker filters by component). `POST /api/ubec/components` accepts `assign_officers`/`unassign_officer` from the Super Admin with the Director's rules (active officer of the component's department, comment required, same origin); an admin assignment also notifies the Director (bell: "Assigned Assessment Officers to …"). Every other workflow step and UBEC comments stay 403 for the Super Admin. The plan page shows a "Super Admin view" note, a reduced header (Administration link, no bell), no UBEC comments, and Remove buttons on open assignments (also for Directors).
- Test: `node --env-file=.env scripts/test-ubec-officers.mjs [baseUrl]` (saves and restores limits/defaults). `test-ubec-flow.mjs` clears defaults for its run; other UBEC tests that release assume no defaults point at their components.

## UBEC comments (migrations 029, 055)

UBEC reviewers comment on the submitted round's snapshot with the same workbook UI (markers, right-click Comment / Comment on row, Ctrl/Cmd+Alt+M, popovers, panel, tab counts). Threads are internal to UBEC until the UBEC BEAP Chair shares them on return.

- Schema (`db/postgres/029-ubec-plan-comments.sql`): `plan_comments.scope` (`state` | `ubec`), `ubec_round_id` (required for, and only for, `ubec`; cascades), `shared_at` / `shared_by_name` (UBEC root comments only). One open thread per cell/row per scope and UBEC round. Replies copy the root's scope and round.
- UBEC API `app/api/ubec/comments/route.ts` (GET/POST/PATCH, `?plan=` and optional `&round=`), helpers in `lib/ubec-comments.ts`, rules in `lib/plan-comments.ts` (`ubecAbilities`, `sharedUbecAbilities`; `ubecAuthorRoles` lists every UBEC role):
  - The BEAP Chair, Directors, Oversight Directors and Assessment Officers start, reply, resolve and reopen on the components visible to them while the round is open (`received` or `reviewing`, latest round). The ES reads every thread; its writes are 403.
  - Threads shared on an earlier round carry forward into later rounds with the state's replies; unshared threads stay on their round. Nothing written after a closed round's decision is shown on that round.
- Sharing: the chair's return dialog lists the round's open UBEC threads, all ticked by default (`components/ubec-share-comments.tsx`). `return` accepts `shareCommentIds` (validated, else 400) and sets `shared_at`/`shared_by_name` in the same transaction; with any other action it is 400; approval never shares.
- State side (`app/api/plans/comments/route.ts`): GET returns state threads plus shared UBEC threads only, with UBEC replies up to `shared_at` and all SUBEB replies. On shared threads anyone who can view the component replies; that department's Data Entry Staff and the reviewer holding the component resolve; nobody at the state starts or reopens UBEC threads. UBEC sees SUBEB replies once the plan is resubmitted.
- UI: SUBEB workbook shows UBEC threads with blue markers and a "UBEC" badge; the UBEC workbook tags threads "Shared" or "Internal".
- Test: `node scripts/test-ubec-comments.mjs [baseUrl]` (throwaway states, users and plan; cleans up).

## Notification bell (migration 031)

A bell sits left of the account pill in `SubebHeader` and `UbecShell` (not the Super Admin header). It replaced the dashboard "Plan updates" alert and "Needs your attention" card.

- `plan_notifications` rows point at exactly one source: `event_id` (state review event) or `ubec_event_id` (UBEC event, cascades), enforced by `plan_notifications_one_source`. UBEC events (`ubec_events.pillar` names the component; wording in `lib/notifications.ts`, links to `/ubec/review?plan=N#ubec-<component>`): `submit` to the UBEC BEAP Chair and ES; `release` to the Directors of the released components and the ES; `assign_officer` to the officers; `complete_assessment` and `observations_done` to the component's Director; `send_oversight` to the Oversight Directors; `ready_for_chair` to the BEAP Chair and Director; `return`/`approve` to the ES and the involved Directors and officers. A UBEC return notifies the SUBEB Executive Chairman, BEAP Chair, and the Directors and Data Entry staff of the round's components (state event `request_changes`).
- API `app/api/notifications/route.ts`: GET returns the newest 30 notifications, `unreadCount` and `todos` (state roles only, from `lib/pending-actions.ts`, which `/api/plans` also uses for `pendingActions`). PATCH `{ ids }` or `{ all: true }` marks the caller's own notifications read (same origin required). Opening a plan's review still marks that plan's notifications read via `POST /api/plans/notifications`.
- UI: `components/notifications/` (`notification-bell.tsx`, `use-notifications.ts`, `notifications.css`); wording in `lib/notifications.ts`. It polls every 30 s and on focus, shows unread count in the tab title, and raises browser notifications for new arrivals while the window is unfocused, once the user clicks "Turn on". One tab alerts per notification (localStorage `beapms:notifications:alerted-through`).
- A notification with a note links to its Review history entry (`#review-event-<eventId>`); `app/beap/review/page.tsx` scrolls to and flashes it after the review loads. Other state notifications open the component sheet (`#review-<pillar>`). The footer shows only actions: "Mark all as read" while something is unread, and "Turn on desktop alerts" until permission is decided, plus a small Sound toggle (Volume icon button) that is always present.
- Sound (`components/notifications/notification-sound.ts`): a ~0.4 s two-note sine chime made with the Web Audio API (no asset) plays once per poll that brings new notifications, focused or not, sharing the OS alert's "new" decision (`alerted-through`), so never for the initial backlog and only in one tab. The AudioContext is created on the first pointerdown/keydown (browser autoplay rules); until then, or if blocked, it stays silent. The toggle is stored per browser in localStorage `beapms:notifications:sound` (default on; turning it on plays a preview).
- Test: `node scripts/test-notifications.mjs [baseUrl]` (throwaway states, users and plan; cleans up).

## Funding sources and plan editing (migration 035)

- Other funding: `plan_funding_sources` rows {component, funder, amount}. `component` is one component, or `'all'` (migration 041) for plan-wide funding that every component shares by the funding-policy percentages, exactly like the state contribution. `sharedEnvelope(plan)` = state contribution ×2 + legacy `other_funding` + all `'all'` sources; a component's ceiling = its policy share of `sharedEnvelope` + its own sources (`componentEnvelope(plan, component)` in `lib/funding-policy.ts`), so ceilings, budget checks, the Teacher Development & ICT shared envelope and the ICT split all include plan-wide funding. Older plans keep `other_funding` as shared funding; new plans store 0 there. API `fundingTotal` = base + legacy other funding + every source.
- Infrastructure and TLM share one pool (`infrastructurePoolEnvelope`): the whole infrastructure policy share (75%) of `sharedEnvelope` + every `infrastructure` and `tlm` source (the picker keeps TLM as its own option; it adds to the pool). How they use it is a platform-wide Super Admin setting (migration 051): `state_workflow_settings.infrastructure_tlm_mode` on the GLOBAL row, Admin > Settings > "Infrastructure & TLM budget" (`/admin?section=budget`, `components/admin-settings/simple-panels.tsx`, `GET/PUT /api/admin/infrastructure-tlm-mode`, `lib/infrastructure-tlm-mode.ts`). Every plan read with `planSetupFields` carries `infrastructureTlmMode` (missing row → `split`; a snapshot without the field reads as `shared_pool`) and `tlmAllocation`, so `componentEnvelope`, save checks, readiness, plan edits, editors and cards follow the mode (`isSplitMode` in `lib/funding-policy.ts`). Switching never changes data.
  - `split` (default): exactly like Teacher Development & ICT. One stored figure, `action_plans.tlm_allocation` (TLM's part; Infrastructure keeps pool − it; NULL until set). `componentEnvelope(plan,'tlm')` = the allocation, `componentEnvelope(plan,'infrastructure')` = pool − allocation (both null until set). Both editors show `components/shared-budget-panel.tsx` first; while the split is unset it opens `components/budget-split-dialog.tsx` by itself (the editor stays read-only behind it, "Set the budget split" reopens it), and once set it is a mini two-colour bar with "Adjust split". The dialog (used for both pairs) is "Share the ₦pool": one bar in the components' `componentPalette` colours with live amounts and % of the pool, a shadcn Slider (step ₦100,000 or 0.5% of the pool, whichever is smaller) clamped at each side's already-planned floor (hatched zone + note), two synced CurrencyInputs, "Even split"/"All to …"/"As saved" presets when valid, and "Save split" (PATCH with the viewer's own side; server errors inline); `PATCH /api/activities/budget-split` with `{ amount, side: 'tlm' | 'infrastructure' }` (`sharedSplit`/`budgetPairs` in `lib/budget-pairs.ts`; 409 in shared_pool mode). Each side needs edit rights on its own component; amount > 0 and ≤ pool, not below its own lines/packages, leaving the other side at least its proposals; TLM may be left ₦0 only while it has no lines. Saves (after `mutatePlan`'s `FOR UPDATE`, re-reading funding and mode with `readPoolState` in `lib/infrastructure-pool-db.ts`): TLM lines are refused until the split is set and past TLM's part (`activityBudgetProblem`, TLM capped via `isCappedFor`), packages past Infrastructure's part (`infrastructureSplitProblem`), both 409; lowering is always allowed; no ceiling while the plan has no funding. Sending (`splitReadinessProblem`/`sendReadinessProblem` in `lib/component-readiness.ts`: every send step, the collated BEAP Chair send, complete-plan and UBEC checks) needs the split set and each side within its part. Plan edits: `envelopeShortfalls` checks each side on its own and `sharedBelowAllocationProblem` refuses a pool below TLM's allocation. Editors show "Infrastructure allocation: ₦X · ₦Y left" / TLM's "Funding envelope"; plan cards show each side's own ceiling (policy pill "75% shared with …" kept). `GET /api/infrastructure/packages` returns `tlmProposed` and `partnerProposed`; `GET /api/activities?workstream=tlm` returns `partnerProposed` (package total). Backfill (migration 051, once): plans with TLM lines got their TLM total, plans with only packages 0, others NULL.
  - `shared_pool`: the earlier first-come pool, `tlm_allocation` ignored. Rule: Infrastructure packages + TLM lines ≤ pool (`infrastructurePoolProblem` in `lib/infrastructure-pool.ts`), both checked on save (409, raising only) and on send; plan edits check the two together (`envelopeShortfalls` reports them `pooled`: "Infrastructure and TLM would share …"); editors show "Shared with Infrastructure/TLM: ₦pool · ₦X left"; cards show the two-part pool bar.
  - The retired `tlmWithinInfrastructure` policy field is accepted and ignored (old rows keep it; new versions store only `shares`); `/ubec/allocations` does not show a TLM split. Tests: `node --env-file=.env scripts/test-infrastructure-tlm-split.mjs [baseUrl]` (split mode, both-mode switching, backfill) and `scripts/test-infrastructure-pool.mjs` (shared_pool mode); each sets the mode for its run and restores it.
- The source picker (`FundingSourcesField`, create and edit dialogs) lists "All components (shared by policy %)" first; labels come from `fundingSourceLabels` (`all` = "All components"). Breakdowns show "Other funding (all components) · Funder · ₦X" (`otherFundingLines`). Lowering, moving or removing a plan-wide source is refused like any other edit that would drop a component below its proposed lines (`envelopeShortfalls`, `sharedBelowIctProblem`).
- Plans can be edited (year, implementation year, quarters, state contribution, funding sources) by anyone `canCreateStatePlan` allows while `statePlanOpen`, via `components/edit-plan-dialog.tsx` and `app/api/plans/setup/route.ts`; edits that would drop a component's ceiling below its proposed lines are refused, and each edit adds a `plan_review_events` 'edit' entry ("Plan details updated").
- Dashboard cards, the hero total, the plan page summary and funding details show "Other funding" with a per-source tooltip (`OtherFundingInfo` in `components/funding-sources-field.tsx`). Test: `node --env-file=.env scripts/test-funding-sources.mjs [baseUrl]` (covers plan-wide sources).

## School register (migrations 034, 044, 046)

- Register source (migration 046, Super Admin, platform-wide): `state_workflow_settings.school_register_source` on the GLOBAL row, `dnemis_only` (default) or `dnemis_and_manual`; set on Admin > Settings > "School register source" (`/admin?section=schools`, `components/admin-settings/simple-panels.tsx`, `GET/PUT /api/admin/school-register-source`, same origin on writes). `lib/school-register-source.ts` reads it and falls back to `dnemis_only` when the row or column is missing. In `dnemis_only` every hand change (add, edit, delete, import preview/commit, template) is refused with 409 "Schools come from DNEMIS. Adding or changing schools by hand is turned off by the administrator." for everyone, including the Super Admin (`registerActor(..., { manual: true })`); viewing and export still work, `/api/schools/options` returns `manualEntry: false` and the `/schools` and admin Schools pages show a read-only table with a "Schools come from DNEMIS" note. The infrastructure editor hides the "Update in the School register" link. The DNEMIS sync is unaffected. Test: `node --env-file=.env scripts/test-school-register-source.mjs [baseUrl]`; `scripts/test-school-register.mjs` switches to `dnemis_and_manual` for its run and restores it.

- `/schools` (nav link "Schools") lets the Executive Chairman, the BEAP Chair and users granted `users.can_manage_schools` (toggled by the Executive Chairman on Users or by the Super Admin) add, edit and bulk-import schools from an XLSX template (`app/api/schools/**`, `lib/school-register*.ts`). `schools.enrolment_by_class` holds per-class figures, with `enrolment_male/female` as totals.
- Public pre-primary, primary and JSS schools come from DNEMIS (see "DNEMIS school sync" below). Synced schools have `schools.dnemis_id` and show a "DNEMIS" badge and their ward; the edit form warns that the next sync replaces the DNEMIS fields. Schools added by hand (no `dnemis_id`) are never touched by the sync. `school_code` (unique per state) is the 10-digit DNEMIS school code.
- `(state_code, name, lga, level)` is unique only for hand-added schools (`schools_manual_name_lga_level_key`, migration 044): DNEMIS has schools with the same name in one LGA. Editing a DNEMIS school checks the code only (`findConflict(..., checkName)`).
- School details (enrolment, coordinates) are read-only in the component editors; managers get an "Update in the School register" link. New schools are added only on the School register page (plan creation no longer has a "new school" step).
- Levels offered (migration 045): `schools.level` stays the main level (plans and models use it); `schools.levels_offered` lists every level a DNEMIS school offers, from the B.3c/B.3a "levels of education offered" answers (SSS for "Junior and Senior Secondary"), the classes with learners, and DNEMIS records with the same name, LGA and ward (DNEMIS keeps a school's primary and JSS sections as separate records with different codes; `mergeSectionLevels` in `lib/dnemis-census.ts`). The register shows all of them (`offeredLevels`), and the Level filter and its counts match any offered level. Empty for hand-added schools (the register shows `level`).
- DNEMIS has no coordinates, so every DNEMIS school shows under the "Missing coordinates" data gap until a manager adds them (the sync keeps town and coordinates).
- Test: `node scripts/test-school-register.mjs [baseUrl]`.

## DNEMIS integration (migration 043)

DNEMIS is a DHIS2 server (`https://asc.education.gov.ng/dhis`, API at `<base>/api`). The Super Admin configures it on Admin > **Integrations** (after Workflow settings), so no deployment or `.env` change is needed.

- Table `integration_settings` (`db/postgres/043-integration-settings.sql`), one row per provider (`'dnemis'` only): `base_url`, `token_ciphertext`, `token_last4`, `enabled`, `updated_by/at`, `last_tested_at`, `last_test_ok`, `last_test_message`.
- Token protection (`lib/secret-box.ts`): AES-256-GCM, key from HKDF-SHA256 over `AUTH_SECRET` (info `beapms:integration-secrets:v1`), random 12-byte IV, stored as `v1:<iv>:<tag>:<ciphertext>` (base64). Changing `AUTH_SECRET` makes the saved token unreadable; the admin must re-enter it. Once saved the token is never returned by any API (only `tokenSet` and `tokenLast4`), never shown in the UI (password field stays empty, no reveal/copy), and never logged or echoed in errors.
- Client `lib/dnemis.ts`: `getDnemisConfig(db)` reads the row (env `DNEMIS_URL`/`DNEMIS_TOKEN` only when no row exists; the placeholder `paste-token-here` is ignored); `dhis2Fetch(path, config, { timeoutMs?, maxBytes? })` sends `Authorization: ApiToken <token>`, 15 s timeout and 5 MB limit by default (the sync uses 90 s / 40 MB), `redirect: 'manual'`, JSON only. A 3xx (DHIS2's `/dhis/login/` redirect), 401/403, a 4xx with `WWW-Authenticate` (DHIS2 answers a bad token with 400 "Checksum validation failed") or an HTML page counts as "token not accepted". `testDnemisConnection()` calls `/api/me` and `/api/system/info` and reports "Connected as <name> · DHIS2 <version> · <org units>".
- Address rules (`lib/dnemis-url.ts`): https only, no credentials, query or fragment; trailing slashes and `/api` trimmed; single-label, `localhost`/`.local`/`.internal` hosts and any host resolving to a private, loopback, link-local, CGNAT or reserved address are refused (checked on save and before every request). Saving a different server origin without re-entering the token is refused, so a saved token is never sent to a new host.
- API `app/api/admin/integrations/route.ts` (Super Admin only; writes need the same origin): GET settings; PUT `{ baseUrl, enabled, token?, clearToken? }` (token omitted keeps it, `clearToken: true` removes it, enabling needs a token; a new address or token clears the last test result); POST `{ action: 'test' }` stores and returns the test result. There is no general admin write log (the Activity tab covers impersonation only), so `updated_by`/`updated_at` record who changed it.
- UI `components/admin-settings/dnemis-panel.tsx` (Admin > Settings > DNEMIS integration, `/admin?section=dnemis`). Tests: `node scripts/test-secret-box.mjs` (unit: encryption round trip/tamper, address rules) and `node scripts/test-integrations.mjs [baseUrl]` (throwaway Super Admin + non-admin; restores any existing row).

## DNEMIS school sync (migration 044)

- `lib/dnemis-sync.ts` `syncDnemisSchools({ states?, years?, dryRun?, triggeredBy, runId? })`, mapping in `lib/dnemis-census.ts`. Per state (DNEMIS state names start with the two-letter code, e.g. "yo Yobe State" = `YO`, "fc ..." = `FC`): org units at level 5 on the two yearly census datasets (Pre-primary & Primary `MLTLNUmvS8r`, JSS `uSw8GwPO417`), paged 1,000 at a time; only the "Public" group, no "Private", not closed. Census values come from `/api/dataValueSets` in batches of 50 schools (4 in parallel; a too-large response is split, timeouts/5xx retried 3 times). Per school it uses the newest year with enrolment among this year and the two before (2025, else 2024 in October 2026), else the newest year with any values.
- Mapping: name without the type prefix and "(code)" suffix; LGA/ward without the state prefix and " LGA"/" Ward" (all-caps names title-cased); level JSS for the JSS form, else Primary, or ECCDE when the form says "Pre-primary only" (or it has pre-primary learners and no primary classes); pre-primary learners of a primary school are its ECCDE enrolment; enrolment by class and sex is summed across the age rows (category option combos "PRY3, Female", "JS1, Male", "Nursery 1, Male"...); location from the Rural/Urban group, else form question B.2, else the school's current value, else Rural; `facilities` = usable/unusable classrooms, toilets, water points, hand-washing, total classrooms, classes held outside, security guard, water source, power, fence condition, health facility (`SchoolFacilities` in `lib/school-register.ts`); `teachers` = D.2 male/female; `dnemis_year` = census year used. Data elements are matched by name, so renamed ids keep working. A school on both forms (none seen) is listed once, as primary.
- Writes: one transaction per state; upsert on `dnemis_id`; a hand-added school with the same school code is adopted (gets the `dnemis_id`). Only changed rows are written (`IS DISTINCT FROM`), so re-runs report "0 new · 0 updated". Town and coordinates are never overwritten. DNEMIS schools that disappear (closed, removed) are kept and counted ("no longer in DNEMIS"), because plans may use them. Codes that DNEMIS repeats are kept by the first school only.
- Runs never overlap (PostgreSQL advisory lock `beapms:dnemis-sync`, plus a Redis lock in the worker). `dnemis_sync_runs` records each real run (`queued` / `running` / `ok` / `failed`, counts, message; at most one queued or running row). Queued runs nobody started within 15 minutes, and running rows whose process died (lock free), are marked failed on the next status read.
- Admin > Settings > DNEMIS integration > School sync (`components/admin-settings/dnemis-sync.tsx`, API `app/api/admin/integrations/sync/route.ts`, Super Admin, writes need the same origin): GET status; POST `{ action: 'start', states?: ['YO'] }` = "Sync now" (`states` limits a run for checks; the card syncs every state; needs the connection on with a token; 409 while a run is active); PUT `{ mode: 'off'|'daily'|'weekly', weekday: 0-6, time: 'HH:MM' }` = automatic refresh (Africa/Lagos, UTC+1, no DST; stored in `integration_settings.sync_*`). The card shows "Next sync <time>" and the last result, and polls while a run is active.
- Who runs it (`lib/dnemis-jobs.ts`): "Sync now" and the schedule add a queued row. With `REDIS_URL` and a live worker (Redis key `beapms:dnemis:worker`), the run id is pushed to the Redis list `beapms:dnemis:jobs`; otherwise the web process runs it after responding (`after()` from `next/server`). The schedule only runs in the worker: each minute it claims the due slot once (`integration_settings.sync_last_slot`, conditional UPDATE) and runs it. Slots missed by more than 6 hours are skipped, and changing the schedule never fires a slot that has already passed.
- Worker: `worker/dnemis-worker.ts`, bundled by `npm run build:worker` (esbuild, part of the Docker build) to `dist/worker/dnemis-worker.mjs` and copied to `/app/worker/` in the image. It is the `worker` service in `docker-compose.prod.yml` (same image, `node worker/dnemis-worker.mjs`, on the frontend network for internet access to DNEMIS, needs `AUTH_SECRET` to decrypt the token; health check reads `/tmp/dnemis-worker-alive`). One-off run inside the app or worker container: `node worker/dnemis-worker.mjs --once [--states=YO,KN] [--dry-run] [--years=2025,2024]` (prints a JSON summary). Locally: `npx tsx --env-file=.env worker/dnemis-worker.ts --once ...`.
- Full national run (local, 4 October 2026): 37 states, 90,222 org units on the two forms, 88,526 imported (68,832 Primary, 16,900 JSS, 2,794 ECCDE; 1,038 closed and 658 non-public left out), 32.8 million learners, 81,206 schools with enrolment, 82,423 with facilities; census year 2025 for 76,828, 2024 for 6,521, none for 5,176. About 8 minutes and 4,035 requests from the CLI (17 minutes in-process on the dev server). Yobe alone: 1,435 schools, about 10 s and 73 requests. DNEMIS data is being entered live, so a re-run a few minutes later can report a handful of genuine updates. 144 schools nationally have a point geometry in DNEMIS (not imported yet).
- Purge before the first import: `scripts/purge-schools-and-plans.mjs` (not a migration; copied into the image as `/app/scripts/purge-schools-and-plans.mjs`). Without `--yes` it only lists what it would delete. It clears every plan and everything that references plans or schools (found from the foreign keys, plus the `retired_*_lines` archives) and all schools with one TRUNCATE without CASCADE in one transaction; users, departments, sessions, funding policies, workflow and integration settings, construction types, sync history and `schema_migrations` are kept. It refuses a non-local `DATABASE_URL` unless `--production-confirmed` is passed. Back up first.
- Tests: `node scripts/test-dnemis-sync.mjs [baseUrl]` (mocked DHIS2 via injected fetch, throwaway state; never calls the real DNEMIS; checks the admin sync API and restores the settings row).

## Redis (optional, `REDIS_URL`)

- `docker-compose.prod.yml` runs `redis:7-alpine` (volume `ubec_redis_data`, backend network only, no published port, `volatile-lru` so only expiring cache keys are evicted) and passes `REDIS_URL=redis://redis:6379` to the app and the worker. Locally leave it unset (`.env.example`).
- `lib/redis.ts` loads ioredis only when `REDIS_URL` is set and fails open: without Redis, or while it is down, nothing is cached and syncs run in the web process. The URL is never logged.
- `lib/school-cache.ts`: per-state cache (1 hour) of the school lists read by the register (facet counts, LGA list) and the component editors' pickers (sports, activities, infrastructure). Keys `beapms:schools:<state>:v<version>:<list>`; invalidation bumps the state's version after a sync, a manual add/edit/delete/import, or the purge script. Only state-wide data that the caller was already allowed to read is cached; nothing per user.

## Sessions

- Sign-in cookie `ubec_session` (`lib/local-session.ts`): slides with use. `components/session-keepalive.tsx` (root layout) sends `POST /api/auth/session` on activity at most every 10 minutes and when the tab comes back into view; each renewal re-issues the cookie for the idle limit (12 hours), never past 7 days from sign-in (`sessionIdleSeconds`, `sessionMaxSeconds`). The renewal also extends the Super Admin `sessions` row and keeps a running impersonation bound to the new cookie (`session_binding`), extending it to an hour from the last activity. Same origin only. Test: `node --env-file=.env scripts/test-session-renewal.mjs [baseUrl]`.

## Admin settings layout

`/admin` has two tabs, Settings and Activity (Users is `/admin/users`). Settings (`components/admin-settings/`) is a section list (sticky on desktop, a Select under 1000px) with one panel each: SUBEB workflow, Supporting documents, Infrastructure & TLM budget, UBEC Assessment Officers, School register source, DNEMIS integration. Deep links `/admin?section=<workflow|documents|budget|officers|schools|dnemis>` (or the hash; the old `?tab=integrations` and `#ubec-officers` still work); the last section is remembered in localStorage `beapms:admin:settings-section`. Rows are label + one-line description (details in an info tooltip) with the control on the right; each panel shows a sticky "You have unsaved changes · Discard · Save changes" bar only while dirty, and every panel stays mounted so drafts survive switching sections (the list marks dirty sections). Primitives in `settings-primitives.tsx`, single-value settings use `use-setting.ts`; the APIs are unchanged.

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

## Whole School audit (Deliverables workbook, no migration)

Infrastructure → Whole School Renovation/Expansion, step 2 "Audit" (`components/infrastructure-audit-table.tsx`, wired into `components/infrastructure-editor.tsx`). The step is one full-width editable table (`.activity-split[data-layout=wide]`, no side form, no preview pane).

- Catalogue `lib/infrastructure-deliverables.ts` (re-exported by `lib/infrastructure-model.ts`) follows UBEC's Deliverables workbook: sheet "Minimum Standard Requirements" (24 deliverables; `category: 'minimum'`, per-model `qty`, workbook wording `standard`, `remark`, `tick` for ✓ cells, `sn`) and sheet "Other Requirements" (30, `category: 'other'`, no standard quantity). Deliverable 1 Classroom stays two rows (`classroomPri` general, built in blocks of 3; `classroomEccde`, built as one ECCDE block) so it counts once (by S/N) in "x/24 complete". The fence (S/N 6) is `fenceDeliverable`; its standard is the metres the site needs (`input.fenceRequired`, required > 0). Teachers' furniture Model III is 32 sets (the workbook prints "= 14", user confirmed 32). Keys are the earlier catalogue's, so older packages load and recalculate unchanged; quantities changed to the workbook (ECCDE classrooms M1 1, ECCDE furniture M1 6, magnetic boards M1 7, teachers' furniture M1 16, solar lights 20 at every model, hybrid solar 7.5/7.5/10 KVA).
- Model choice (step 1 inside the audit): three cards (`modelSummary`), enrolment pre-selects and labels "Suggested for N learners"; the choice is stored in `input.model` (0-2) and drives every Minimum Standard row's standard, required quantity, tooltip and costs (`packageModel`). Packages saved before it have no `model` and use the enrolment model (`modelFor`); entering the audit step sets it. Rows a model does not ask for (`appliesToModel`: empty workbook cell) are not shown; a model change that would drop entered rows asks first (none today: every Minimum Standard cell is filled).
- Table: ToggleGroup All / Minimum Standard (default, "x/24 complete") / Other Requirements ("n added"); group sub-header rows; sticky first column (S/N, name, info Tooltip with the chosen model's standard, the remark and all three models); Standard, Required, Existing, Functional, Non-functional, Additional, Extra beyond standard, Status. Audit rows keep `{existing?, functional?, extra}`: a Minimum Standard row is complete once existing and functional are entered (`auditRowProblem`); Other Requirements are optional and join the package once any figure is entered (clearing all removes the row). Enter / Shift+Enter move down / up a column. Phone: the table scrolls inside its card.
- Rules shared by client and server (`packageProblem`): a Whole School package needs `model` ("Choose the school model for the audit."), every Minimum Standard row (`wholeAuditProblem`), and unknown audit keys are refused by the schema. Retired fields: Site observations, Extent of dilapidation and Structural condition notes are no longer asked or required (`observations`/`dilapidation`/`conditionNotes` stay in the schema so old packages load; old values still show in package details and `observations` still feeds the snapshot `rationale`). Photographic evidence moved to the Review step's Supporting documents, next to the Bill of Quantities; it is required while general classrooms are recorded non-functional (`photoEvidenceRequired`, server and client) only when the Supporting documents setting is Required (migration 052).
- Display: `AuditSummaryTable` in `components/infrastructure-package-details.tsx` (workbook row details, UBEC view, Gaps step) lists every Minimum Standard row plus Other Requirements that were filled in, with the Standard column.
- Test: `scripts/test-infrastructure-packages.mjs` (model required and honoured, Minimum Standard required, fence, functional ≤ existing, unknown keys, Other Requirements optional, an old-catalogue package loads/displays/recalculates).

## Recent user-facing work

- Removed the unneeded “Accessible by design” component.
- Renamed “Whole School Approach” to “Whole School Renovation/Expansion”.
- Whole-school audit: see "Whole School audit" below (one editable table, model choice, Minimum Standard / Other Requirements).
- Selecting a school already used by another activity shows a dismissible orange warning toast.
- Furniture/equipment items use a compact editor plus table instead of endlessly duplicating full forms.
- Required item fields are visually marked and incomplete items block Continue.
- Learner counts are locked only when a value exists; empty values remain editable.
- Fixed several production-only navigation failures by using real links/navigation rather than fragile client-only click behavior.
- Plan title is shown as `<year> · <quarters> BEAP`, not “action plan”.
- Workspace branding is `<STATE> SUBEB`; FCT is `FCT UBEB`.
- Admin workspace has Users first, then Workflow settings, then Activity; platform settings are global.
- Login uses a full-page UBEC education-photo slideshow with soft image transitions, overlaid login card, UBEC identity link to ubec.gov.ng, and a custard orbit/glow on the login button. Videos were intentionally abandoned in favor of images.

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
- The UBEC flow tables (`ubec_officer_assignments`, `ubec_item_decisions`, `ubec_oversight_reviews`, migration 055) reference `users`; they are transactional and go with their rounds. Restore UBEC accounts with `scripts/seed-ubec-users.mjs` after a reset.
- `ubec_default_officers` (migration 056) references `users` (ON DELETE CASCADE), so `TRUNCATE users ... CASCADE` empties it: it is configuration; set the default officers again on Admin > Settings > UBEC Assessment Officers. `ubec_officer_limits` has no FK and survives.
- `integration_settings` (migration 043) references `users`, so `TRUNCATE users ... CASCADE` empties it and the DNEMIS connection must be set up again on Admin > Settings > DNEMIS integration. Record (outside source control) that it needs re-entering, or exclude it from any reset.

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
