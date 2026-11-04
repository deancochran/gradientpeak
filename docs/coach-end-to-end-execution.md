# Complete coach workflow execution

## Outcome

Implement connected coach and athlete journeys: invitation, athlete onboarding,
athlete-controlled consent, coach responsibility, training assignment, schedule
adaptation, completed-results review, and feedback. Administrative CRUD alone is
not acceptance. User authorized mapping and implementation on 2026-11-04.

## Invariants

- Organization administration, engagement, coach assignment, and athlete consent
  are independent. An administrative role never grants private training access.
- Every private read and write is authorized on the server for the current actor,
  athlete, organization, capability, and relationship state.
- Invitation secrets must not enter analytics, logs, referrers, or public caches.
  Creating an invitation is not sending or delivering an email.
- Training edits preserve completed activity history and athlete-owned data.
- Unknown mutation outcomes retain an exact-operation recovery path. Historical
  receipts must not be shown as current state.
- Logout, consent withdrawal, suspension, and reassignment retire stale access.
- Do not reset preserved data, activate real outbound email, apply authoritative
  schema changes, or deploy without the required separate authority.

## Delivery sequence and acceptance

| Journey | Required outcome | Proof | Current state |
| --- | --- | --- | --- |
| Invite | Targeted invitation, usable link, expiry/revoke, honest email attempt status and retry | Sender and recipient browser journey; fake-mail transport/failure tests | Raw-token creation/response exists; email delivery absent |
| Onboard | Sign in/create identity, complete required personal setup, return to the invitation and coaching relationship | New and existing athlete journeys, wrong-recipient rejection | Existing personal onboarding; coaching continuity being mapped |
| Consent | Athlete sees scope/policy/recipient and explicitly grants or declines; withdrawal takes effect | Capability matrix, transactional tests, athlete/coach UI | Existing domain/schema being mapped; no assumption of grant workflow |
| Coach responsibility | Assign/change/end eligible coach responsibility without manufacturing consent | Owner/admin/coach/athlete access tests and disposable DB assertions | Group assignment exists; direct assignment workflow being mapped |
| Deliver training | Coach selects authorized athlete/group, assigns and personalizes training with clear scope/date effects | Persisted athlete calendar and plan assertions | Personal authoring exists; delegated delivery being mapped |
| Change schedule | Move/replace/edit/cancel upcoming sessions; distinguish individual from group updates | Timezone/conflict/completed-history/retry coverage | Existing calendar capabilities being mapped |
| Review results | Coach sees only authorized athletes, planned versus actual results, missed work and activity details | Authorized and denied reads, results browser journey | Personal activity review exists; coach entry points being mapped |
| Give feedback | Athlete-visible feedback and explicitly private coach notes have correct audiences and recoverable delivery | Two-actor browser proof and permission tests | Existing discussion/message capabilities being mapped |

## Baseline and ownership

- Dedicated branch/worktree: `feat/coach-end-to-end` / `feat-coach-end-to-end`.
- Created from fetched `origin/main` at `c7072ca839ca646f9a8db470af26756b8327cbe7`.
- Exact feature prerequisites merged without preview backflow: staff
  `b83b322214f710e027f29b6030bea230b856de7f`, auth
  `9ffaa714892ba6eee1d5e4699e2371f2dfed19bd`, recipient/group workflows
  `5d0f5afb5a56d055143ddffabcac1c059a64ae6c`.
- Combined starting checkpoint: `a67ba7d4443df7c57f3bc66d6bcbe4e709a01066`.
- Coordinator owns contracts, review, verification, publication and locked preview
  integration. Workers never edit preview or manage its servers.
- Earlier W00–W17/E01–E29 constraints remain in force; this execution map expands
  acceptance to connected coaching journeys rather than silently marking them done.

## Evidence and open boundaries

Direct assignment API checkpoint `d489fc747398cfe63ed9f33601bb5787227ca1ad`
is live in preview at `8dff4239e6f38a8a09172f8566f218336f543368` with locked
ancestry checks, six focused tests and healthy web/login probes. Coordinator ran
the wired fresh-disposable DB test independently and on this combined branch;
both passed, as did API typecheck. Independent recheck closed all three findings.
Athlete-roster assignment controls are now live from isolated
`feat/coaching-assignment-web`, checkpoint `4f4bfd6e03a553d7109d55ba96977e7140295427`,
preview `36007c50af29727a14d3ade415105dd115ba7a39`. Review exposed and repairs covered
parent access-loss redaction, actor/tenant fencing, exact-retry preservation,
candidate pagination races and mutually exclusive pending administrative workflows.
Final focused suite: 26 tests and typecheck passed. Disposable desktop/mobile
assign/end journey `acceptance-1045551-1793812819118` passed 2/2 with ended history
and no consent rows. The final mutual-exclusion addition passed roster regressions;
combined acceptance `acceptance-1056796-1793813035775` passed all eight desktop/mobile
invitation and assignment browser cases on the combined branch. Web typecheck and
three ownership checks also passed.
Locked ancestry, integrated 26 tests, web health and login probes passed.

Invitation links are committed through
`c0f3b9c009c91faa6ca90f8ba7d61b5ec749fe1c` and merged into this branch at
`a14c7079fc3dcd77d4e4a1a15f4e8a2b03f6a53d`. The coordinator added real login and
required-onboarding browser continuation, explicit accept/decline persisted-state
assertions, StrictMode handoff retry/actor-switch regressions and storage tests.
Acceptance `acceptance-961094-1793811179490` passed six desktop/mobile cases.
A final no-identity-consumption guard has independent review clearance and 51
focused passing tests plus typecheck. Final production build and browser acceptance
`acceptance-973261-1793811403221` passed all six desktop/mobile cases. Links are live
in preview at `f5b7c0461ec33a5d06ccfe5d5b8636b9dec9623c`: locked ancestry check,
51 integrated tests, health and public entry rendering probes passed.
The earlier build-log redirection failed on file permissions before build started;
the retry used tool-managed output, without changing permissions. No real email
delivery or telemetry transport activation occurred. Runtime SDK event/replay
payload redaction remains unproven beyond static and unit safeguards.

Publication of these new checkpoints remains outstanding. Two normal push attempts
stopped at architecture and optional-property strictness checks respectively.
Removed an unused repository type alias, omitted absent optional inbox properties,
and reconciled exact app-owned component inventory entries without weakening gates.
Architecture now has zero new violations; strictness has zero added diagnostics;
ownership tests passed before adding the new assignment composition inventory entry.
No complete coaching
journey is accepted yet. Prior staff and auth browser evidence applies to
their recorded feature checkpoints, not automatically to this combined branch.
The reported authenticated iPhone Safari black screen remains unconfirmed as fixed.
Remote release/security gates remain separate from disposable feature acceptance.
Email transport activation and any required durable delivery schema will be called
out explicitly after inspecting existing delivery infrastructure.

## Confirmed backend gaps and implementation lanes

Read-only backend mapping found substantive missing seams, not merely absent links:

1. Invitation acceptance creates an engagement but intentionally does not create
   consent or a coach assignment. No invitation email/outbox path exists.
2. Consent tables, read authorization, and withdrawal exist; explicit athlete grant
   and status endpoints are missing. Implement against existing schema first,
   failing honestly when no published policy exists rather than inventing terms.
3. Direct coach responsibility has schema/constraints but no management command.
   Assignment must remain independent from consent; it alone grants no private access.
4. Planned-session and training-plan application commands are owner-only. Coach
   delivery needs explicit delegated-write authority, not a read-consent shortcut
   or substitution of the client-supplied athlete ID into an owner-only call.
5. Activity reads have consent-aware infrastructure. Generic comments do not yet
   establish coaching feedback audiences; athlete-entered RPE must not be reused
   as coach-entered evidence.

Active implementation:

- Invitation links: isolated `feat/coaching-invitation-links`; secure link creation,
  recipient handoff and copy fallback, without pretending email has been sent.
  Initial route-only implementation was blocked and left no source changes.
  Coordinator expanded ownership to a public entry route and minimal early-client
  bootstrap: `client.tsx` imports `instrument.client.ts` before rendering, and
  that module initializes Sentry. Capture/scrub must precede Sentry initialization
  as well as PostHog, not merely run in `getRouter` or a recipient effect.
  Expiring same-origin session storage is allowed for authentication continuity;
  storage failure must fail closed, and consumed secrets are actor-bound in memory.
  Revised implementation returned uncommitted with worker-reported 36 passing
  tests, typecheck and production build. Independent review found initial actor
  reset cleared the response token, StrictMode discarded automatic preview, invalid
  replacement links retained stale storage, and the storage getter could crash the
  route. Worker is repairing all four with explicit-response and lifecycle tests.
  Authored browser coverage stopped at authenticated preview, not response or
  logged-out onboarding continuity; both must be expanded before acceptance.
  The disposable browser runner disables telemetry, so its absence of network
  events alone cannot prove active SDK redaction. Not accepted or live.
  Repair handoff reported 20 focused tests passing, but omitted required StrictMode
  handoff commands, throwing storage operations, decline and login/onboarding
  browser cases. Coordinator continued the same lane to finish these tests and
  rerun checks on final code; earlier production build is not final-state proof.
  Browser acceptance port 3100 was checked free; execution awaits stable repaired
  source, not additional user authority.
- Athlete consent: isolated `feat/coaching-consent`; explicit status/grant contract,
  current-policy validation, athlete-only authority and durable retry tests.
- Direct coach responsibility: isolated `feat/coaching-direct-assignments`; explicit
  organization-bound assignment/replacement/end commands, serialized lifecycle
  checks and exact-operation recovery. No consent prerequisite or implicit access.
  Six new API files returned uncommitted; worker reports five unit tests and API
  typecheck passed. Independent implementation review is running. Coordinator found
  the authored DB test discarded concurrent outcomes and did not exercise its
  claimed rollback scenario; worker strengthened those assertions. Coordinator
  started the exact disposable test file with `vitest.live-db.config.ts` and one
  worker after inspecting the managed-target guard and fresh database lifecycle.
  First execution failed at coach eligibility (`not_found`, application line 79).
  Independent review also found ambiguous cross-action correlation receipts,
  historical replay incorrectly requiring a currently active engagement, and
  expected-ID receipt payloads exceeding the audit JSON limit. Worker now owns
  repair and exact guarded disposable reruns; no preserved-data access authorized.
  Requested bounded canonical state fingerprint instead of an arbitrary assignment
  cardinality cap. No database acceptance is claimed yet.
  Repair returned: explicit locked coach-grant query, complete correlation lookup,
  historical replay after current-manager authorization, and SHA-256 state digest.
  `list` now returns `stateDigest`; commands require `expectedStateDigest` instead
  of `expectedAssignmentIds`. Worker reports six unit tests and one fresh disposable
  test passing. Coordinator independent rerun and reviewer recheck are in progress;
  router fan-in and preview disposition remain outstanding.
  Router wiring, real disposable proof, commit and preview integration remain
  coordinator-owned. This backend slice is not accepted or live.
- Coordinator: workflow integration, delivery architecture, permission decisions,
  proof and publication. Existing auth mailer is auth-specific and its log mode
  prints action URLs; do not reuse that mode for invitation secrets.

## Connected route and permission contract

The existing organization shell links only Dashboard, Organizations and Personal
workspace. Athletes, Staff, Groups and Invitations already have routes; navigation
must expose authorized destinations without introducing placeholder workflows.
Organization route access and private athlete access remain separate boundaries.

The athlete path must preserve a safe return destination through login, verification
and onboarding, then show recipient-bound invitation preview and explicit response.
Neither opening a link nor accepting an invitation grants consent. The next screen
must show the actual organization's published policy and requested scopes, current
grant state, and an explicit choice; a missing policy is unavailable, not implicit
consent. Declining or withdrawing must not delete the athlete's personal history.

The coach path is roster → selected engagement → current responsibility and access
capabilities → athlete workspace. Administrative roster access must never render
private training data. The workspace must bind every response and pending command
to actor, organization and athlete; switching contexts or losing access fences late
responses. Do not repurpose the personal workspace by replacing the signed-in ID.

Existing reusable seams, subject to explicit delegated authorization:

- `createDirectPlannedSession`, `previewTrainingPlanApplication` and
  `applyTrainingPlanApplication`: training delivery and authoritative previews.
- `movePlannedSession` and the planned-session command repository: revision checks,
  exact retries and durable provider follow-up for schedule changes.
- `withAuthorizedAthleteRead*`: scope-specific private reads inside the authorized
  transaction; these helpers do not establish permission to write.
- Activity result presentation: source/review status and planned-versus-actual
  evidence. Unknown or unresolved imports must remain visibly uncertain.
- Existing comment stable-ID recovery patterns: reusable interaction behavior,
  not proof that social comment audiences satisfy coaching feedback privacy.

Required cross-actor failures include wrong invitation recipient, revoked/expired
invite, incomplete onboarding, absent/withdrawn consent, suspended coach, ended
engagement, changed primary coach, stale schedule revision, lost command response,
post-save navigation failure, and a late response after athlete/account switching.

## Invitation email delivery boundary (design, not implementation)

No existing invitation outbox or delivery-attempt schema was found in the inspected
DB source. The current invitation stores a digest and returns its secret once;
later delivery cannot reconstruct that secret. A durable design therefore needs
an explicit secret-retention strategy, not a fire-and-forget call to the auth mailer.

Proposed minimal contract for review before schema implementation:

- Queue creation and invitation creation commit atomically, with a stable delivery
  operation identity and recipient/template version. No network send in a DB lock.
- Retain a bounded-lifetime encrypted payload with separately configured key
  ownership; never place a bearer token in logs or audit JSON. Destroy retained
  secret material after its defined terminal/expiry retention boundary.
- Use leased attempts and distinguish queued, sending, provider-accepted, failed,
  cancelled and unknown outcomes. Provider acceptance is not recipient delivery.
- Retry unknown provider outcomes with the same provider idempotency identity when
  supported; otherwise expose duplicate-delivery uncertainty rather than claiming
  exactly-once email. Explicit resend is a new delivery attempt, not a new consent.
- Recheck invitation validity before dispatch; revocation/expiry prevents future
  sends but cannot recall a message already accepted by a provider.
- Prove queue rollback, worker interruption, retry, expiry/revoke and redaction with
  fake transport on a designated disposable target before any real-service use.

Authoritative schema application, encryption-key provisioning and real outbound
activation are still separate approval boundaries. Copy-link delivery must remain
usable independently, and the UI must continue to say no email was sent until
durable delivery evidence exists.
