# UBEC review flow (migration 055)

This replaces the earlier UBEC review (the UBEC Executive Secretary assigned components to departments and
Department Reviewers sent one recommendation each). It follows the client's "Roles under UBEC" document.

## Roles

| Role (users.role) | Department (users.department) | What they do |
|---|---|---|
| `UBEC BEAP Chair` | none | Receives submitted plans, comments and releases them to the departments, then approves the plan or returns it to the SUBEB. |
| `UBEC Director` | one component department | Assigns Assessment Officers per component (with a comment), comments on items, reads officer results, adds their comment and sends each component for oversight. Adds Assessment Officers to their department. |
| `UBEC Oversight Director` | `audit`, `procurement` or `finance` | "God mode": sees every component once it is sent for oversight, comments on items, clicks **Observations done**. Never accepts or rejects anything. |
| `UBEC Assessment Officer` | one component department | Accepts or rejects each item (line) of the components assigned to them, comments, then **Complete assessment**. Replaces `UBEC Department Reviewer`. |
| `UBEC Executive Secretary` | none | Supervisory and read-only: sees every plan, stage and comment (internal ones too). No workflow actions. Still edits funding allocations. |
| `Super Admin` | | Unchanged; creates and edits every UBEC role. |

Any active user holding the role/department can act for it (a second Audit Director, for example, can click Observations done for Audit). The admin API keeps one active BEAP Chair, one Director per department and one Oversight Director per oversight department.

### Departments and components

Keys are kept from the earlier `departments` list where the department continues, so old assignments still show a name.

| Key | Department | Components (pillars) |
|---|---|---|
| `physical` | Physical Planning (DPP) | Infrastructure (`infrastructure`), Supervision & Monitoring (`monitoring`) |
| `planning` | Planning, Research & Statistics (DPRS) | Planning / EMIS (`planning`) |
| `academic` | Academic Services (DACS) | Sports, TLM, Curriculum, Greening (`sports`, `tlm`, `curriculum`, `gscci`) |
| `teachers` | Teacher Professional Development (DTPD) | Teacher Development (`teachers`) |
| `digital` | Data, Digital Platforms & Analytics (DDDPA) | ICT (`ict`) |
| `quality` | Monitoring & Evaluation (DME) | Quality Assurance (`quality`) |
| `social` | Social Mobilisation (DSM) | SBMC (`sbmc`) |
| `audit`, `procurement`, `finance` | Oversight (Audit, Procurement, Finance) | none: they observe every component |

TLM keeps its budget model (it shares the Infrastructure pool on the SUBEB side) but its UBEC review belongs to DACS.
`administration`, `special` and `zonal` stay as legacy names so earlier rounds still read correctly.

### Migrating existing accounts

`UBEC Department Reviewer` accounts become `UBEC Assessment Officer` in their department, except `audit` and `finance`
reviewers, who become `UBEC Oversight Director` for that department. The role check keeps the legacy value allowed so an older
container still running during a rolling deploy cannot fail; the new code treats it as having no UBEC access.

## State machine

A UBEC round (`ubec_rounds`, one per submission) keeps its statuses: `received` (with the UBEC BEAP Chair), `reviewing`
(released), `returned`, `approved`. New columns: `released_at`, `released_by_name`, `release_comment`.

Each released component gets a `ubec_round_components` row:

```
              assign officers (Director, comment)       all officers completed + Director comment
 release ──► director ─────────────────────────────────────────────────────────────────► oversight
                 ▲  officers: decide items, Complete assessment                              │
                 │                                                                           │ Audit + Procurement + Finance
                 │                                                                           │ each "Observations done"
                 │                                                                           ▼
                 └──────────── (return: new round) ◄──── chair decision ◄──────────────── chair
```

- `stage`: `director` → `oversight` → `chair`. The move to `chair` is automatic when the third oversight department finishes.
- Officers: `ubec_officer_assignments` (component, officer, assigned by, comment, `completed_at`, `completion_note`, `removed_at`).
  An assignment can be removed while it is not complete. One officer can hold several components of their department.
- Items: `ubec_item_decisions` (round, pillar, row_ref, `accept` | `reject`, note, officer). One decision per item per round;
  any officer assigned to the component may set or change it until their assessment is complete. Items are the lines of the
  component's sheet (`row_ref` is the durable workbook row id, the same ids comments use). Distribution lists are not items.
- Oversight: `ubec_oversight_reviews` (component, department, reviewer, note, `completed_at`), unique per component and department.

Round decision (UBEC BEAP Chair): only when every released component is at `chair`.
- **Approve action plan**: refused (409) while any item is rejected or undecided. Plan `ubec_approved`.
- **Return to SUBEB**: always the whole plan. Every component goes back to `changes_requested`; the UBEC threads ticked in the
  dialog (all open ones by default) are shared; the item results become visible to the state (`/api/ubec/results`).

Resubmission creates the next round in `received`. Item decisions of the previous round are returned as `previousDecisions`
(by row id) for reference; shared threads carry forward as before.

Rounds created before migration 055 that are still open are moved back to `received` so the BEAP Chair releases them in
the new flow; their old department assignments (`ubec_assignments`) stay readable as "Earlier department reviews".

## Visibility (stage-gated)

| Viewer | Rounds and components visible |
|---|---|
| ES, BEAP Chair | Every round, every component |
| Director (dept D) | Components of D once released (plus legacy assignments of D) |
| Oversight Director | Components once sent for oversight (stay visible after) |
| Assessment Officer | Components with an assignment to them (not removed) |
| SUBEB | Results and shared threads only after a decision (returned/approved); a state user sees the components their role and stage allow |

A viewer sees a round only if at least one of its components is visible; snapshots are filtered to visible components.
Document downloads (`componentDocuments`, line documents, infrastructure documents, RAT) use the same rule (`ubecSeesPillarSql`).

## Permissions

| Action | Who | Preconditions (else 409 unless noted) |
|---|---|---|
| submit | SUBEB Executive Chairman | unchanged |
| release | UBEC BEAP Chair | latest round `received`; comment required (400) |
| assign_officers | Director of the component's department | round `reviewing`, stage `director`; comment required (400); officers active, same department (400) |
| unassign_officer | Director of the department | stage `director`, assignment not complete |
| decide item (accept/reject/clear) | Officer assigned to the component | stage `director`, own assignment not complete, row in the round snapshot (400) |
| complete_assessment | Assigned officer | stage `director`, not complete, every item decided |
| send_oversight | Director of the department | stage `director`, at least one officer, all officers complete; comment required (400) |
| observations_done | Oversight Director (audit/procurement/finance) | stage `oversight`, their department not done yet |
| approve | UBEC BEAP Chair | round `reviewing`, every component at `chair`, nothing rejected or undecided; comment required |
| return | UBEC BEAP Chair | round `reviewing`, every component at `chair`; comment required; `shareCommentIds` validated |
| UBEC comments start/reply/resolve/reopen | Chair, Director, Oversight, Officer on visible components | round open (`received` or `reviewing`, latest) |
| anything above | UBEC Executive Secretary | always 403 (read-only) |

Every write: same origin (403), the user re-read from the database with `FOR SHARE` (401/403), the plan row locked (`FOR SHARE`
for component actions, `FOR UPDATE` for submit/release/decisions) and then the round row `FOR UPDATE`, so concurrent steps
serialise and stale ones fail with 409. Plan-level steps also check `action_plans.version`.

## API

- `GET /api/ubec/review?plan=&round=` – plan, rounds, round (filtered snapshot), `flow` (components with officers, decision
  counts, oversight progress; visible decisions; previous decisions; the viewer's abilities; department officers for a
  Director), legacy assignments and events.
- `POST /api/ubec/review?plan=` – `submit` | `release` | `approve` | `return` (`version`, `roundId`, `comment`, `shareCommentIds`).
- `POST /api/ubec/components?plan=` – `assign_officers` | `unassign_officer` | `complete_assessment` | `send_oversight` | `observations_done`.
- `PUT /api/ubec/decisions?plan=` – `{ roundId, pillar, rowRef, decision: 'accept' | 'reject' | null, note }`.
- `GET /api/ubec/dashboard` – role-aware: plan items with per-component pipeline, the viewer's queue, workload and activity.
- `GET|POST /api/ubec/officers` – a Director (own department) or the BEAP Chair (any component department) lists and adds Assessment Officers.
- `GET /api/ubec/results?plan=` – state view of a decided round: per component accepted/rejected counts, rejected items and notes,
  Director and oversight comments, for the components the state viewer may see.
- `/api/ubec/comments` – unchanged shape; abilities follow the visibility table, the ES is read-only.

## Notifications (bell, `ubec_events.pillar` added)

| Event | Recipients | Wording |
|---|---|---|
| submit | UBEC BEAP Chair, ES | "<State> sent the plan to UBEC for review" |
| release | Directors of the released components' departments, ES | "Released <n> components to your department" |
| assign_officer | the officer | "Assigned you <component> to assess" |
| complete_assessment | Directors of the department | "Completed the assessment of <component>" |
| send_oversight | Oversight Directors | "Sent <component> for your observations" |
| observations_done | Directors of the department | "Finished observations on <component>" |
| ready_for_chair | BEAP Chair | "<component> is ready for your decision" |
| return / approve | ES, Directors and officers involved; state: Executive Chairman, BEAP Chair, Directors and Data Entry of the round's departments | existing state wording |

## UI map

- `/ubec` dashboard, per role: hero with role and department; queue ("Awaiting your observations", "Ready to release",
  "Ready for your decision", "Assign staff", "Items to assess"); SUBEB-style plan cards (state, amount, status pill, funding gauge);
  Directors see component cards (cost, % of plan, stage pill, officers, "View", "Assign staff"); officers see their components
  with progress; the ES sees the national overview (KPIs, map, pipeline, table).
- `/ubec/review?plan=` plan page: summary card with gauge, UBEC component cards (stage, cost, share of plan, officers,
  decisions, oversight progress "Waiting for Audit · Procurement · Finance"), the BEAP Chair bar (Release / Approve / Return),
  the item assessment table (Accept / Reject / View / Comment), Complete assessment modal, Assign staff dialog, Send for
  oversight dialog, Observations done dialog, the workbook with UBEC comments and the review trail.
- `/ubec/team` – a Director or the BEAP Chair adds Assessment Officers, up to the department's officer limit.

## Officer limits and default officers (migration 056)

The Super Admin sets, on Admin > Workflow settings, how many active Assessment Officers each department may have (default one per
component) and the default officer(s) of each component. The release assigns the defaults automatically ("Assigned by default
(Admin)", event `default_officers`, officers and Director notified); without defaults the Director assigns. The Director can still
add or remove officers, and the Super Admin can assign or remove officers on any component at stage `director` with the same rules.
- SUBEB plan page: "UBEC assessment" card after a return or approval.
- Admin Users: the new roles with department choices.
