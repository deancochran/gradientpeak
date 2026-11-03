# Web-only organization management

## Outcome and authority

User approved proceeding with web-first administrative authorization, Personal /
organization navigation, and complete management workflows. Organization
administration is web-only for now. Mobile navigation and administrative screens
must remain unchanged. The same authenticated identity can be athlete, coach and
owner across multiple organizations; no separate login or account type.

## Source and delivery

Feature `feat/coaching-web-management`, clean base
`b07c5ebfc93f475717f48234da58a1c242d4751c`, starts at fetched main with prerequisite
Core/API checkpoint `8b6186a642b3ad4d7de6858056257d180867c85d`. No preview backflow.
Prior implementation branch is left unchanged while its reduced-concurrency
publication attempt completes. Coordinator owns review, commits, locked preview
integration and publication. Workers never mutate preview or its servers.

## Behavior contract

- Reuse canonical authentication and current organization authorization.
- Personal context stays accessible regardless of staff roles. Staff membership,
  athlete enrollment, assignment and consent remain independent.
- Organization URLs identify the active organization; refresh/deep links restore
  that context. Local preferences are not authority.
- Server/API checks remain authoritative. Navigation hiding never grants or
  revokes access. Administrators do not inherit private athlete training access.
- Scope remote data and cache keys to actor/organization. Do not render another
  tenant's stale data after switching or losing access.
- Explicit loading, empty, error and access-lost states; accessible safe return
  to Personal and organization selection.
- Reuse shared UI/form primitives and existing theme. No fake or unsupported
  administrative controls; each visible action must complete a verified workflow.
- Invitation links/tokens are sensitive and must not enter analytics/logs.
  Generated invitation links do not imply email delivery.
- No schema changes, preserved-data test fixtures, real invitations, deployments,
  or new authentication system. Privacy controls for athletes remain separate
  from administrative UI and must not require administrator impersonation.

## Delivery slices

1. Guarded web workspace navigation and functional entry/overview using existing
   setup/context/staff/roster API capabilities.
2. Fill missing invitation/admin contracts with transactional authorization and
   disposable DB proof, then expose complete web staff/enrollment workflows.
3. Direct/group assignment and athlete privacy workflows with access provenance;
   sanitized audit history and safe lifecycle confirmations.

Ownership-transfer acceptance and any missing durable notice/receipt storage need
concrete designs, not assumptions about status columns. Unsupported schema-backed
features remain explicitly unavailable until their prerequisites are approved.

## Evidence and status

In progress—not live. Existing setup/invitation/group/lifecycle APIs remain live
in preview separately. Web worker owns only focused apps/web files/tests;
coordinator owns this document and later API scope. Planned evidence: focused
component/route tests, web types, build for SSR/module boundaries, independent
security review, and browser navigation/runtime checks without preserved-data
mutations. New useful checkpoints integrate under SHARED-PREVIEW.md before
unrelated release gates. Reduced test concurrency, not relaxed assertions or
timeouts, is required on the currently overloaded host.

## Backend follow-up discovery

Existing schema permits role-grant insertion, one-way revocation, and non-root
membership suspension. Absence of dedicated SQL commands does not prohibit an
authorized API transaction; those actions need organization-first locks, current
actor/target policy, atomic attributed audit and durable correlation replay.
Root-owner protection remains enforced by deferred database constraints.

Coordinator corrected a discovery claim about decline: baseline function
`validate_organization_invitation_actor` explicitly returns NEW for a declined
transition after the pending-to-terminal immutability checks (line3016 at this
base). Therefore a new SQL function/migration is not established as necessary.
The API must authenticate and lock canonical recipient identity, verify the
token/recipient binding, scope and lock the organization/invitation, populate
declined_by_profile_id and prove replay/denial semantics in a disposable DB.

Next bounded API additions after the web lane handoff: administrator invitation
listing, recipient-safe preview/decline, then role/suspension administration. Never
return stored digests or log raw invitation tokens. Recipient preview should use
uniform failures and return only the intended organization's invitation context.

## Prerequisite publication update

Reduced-concurrency normal push of API checkpoint8b6186a6 passed the static/test
gate, full DB verification and selected public-share API live tests. Publication
then failed when Playwright's webServer could not start its E2E database
prerequisite. No remote branch/PR success is claimed. Read-only diagnosis is in
progress; retained E2E data is not disposable and no reset/reseed is authorized.
The web feature worktree isolates new edits from that frozen prerequisite gate.

Read-only diagnosis subsequently confirmed the retained E2E ledger contains only
the expected `20260730000000`, but its actual schema fingerprint differs from the
API checkpoint. Running the existing fingerprint checker against verified
loopback port55322 with default_transaction_read_only=on exited1: table/column/
index/trigger/function/constraint/public-relation differences include missing
chatbot tables and organization-management group/invitation objects. The earlier
historical accounts_pkey migration error is not established as the current cause.
The wrapper's status failure comes from schema verification, not a missing ledger
version. No retained data or schema was changed. Recovery requires a separately
approved, data-preserving retained-E2E schema reconciliation; preview-upgrade
approval does not extend to this target. Do not regenerate the expected
fingerprint to hide drift or bypass the publication hook.

## Web checkpoint verification

Five initial review findings have fixes awaiting independent re-review: scoped
reads use POST, uncertain create retries retain the draft UUID and reject edited
payloads until explicitly starting a new draft, dependent roster FORBIDDEN maps
to access-lost, existing Core IANA validation is reused at the API/form boundaries,
and coach/admin browser journeys reflect their distinct capabilities.

Coordinator rerun passed 28 web tests across11files (including creation retry),
4 organization API tests and architecture with zero new violations. Worker reports
web/API/Core types, scoped Biome, production web build, and two authenticated
disposable browser journeys passed. The browser cache header assertion covers
the SSR document, not independently reachable server-function responses; POST
registration is separately covered by unit tests. Coordinator launched the wider
coaching browser selection on the documented isolated disposable acceptance
lifecycle. No retained or preview fixtures were modified. Preview integration
awaits that evidence and final review; coordinator owns the commit and integration.

Final independent source review found no remaining actionable defects in the five
findings and marked the slice preview-eligible (not release approval). Coordinator
disposable browser run `acceptance-1994293-1793664466829` passed all11selected
journeys, including coach/admin dashboard, narrow history, revoked-role denial
and settings regressions. Actual Vitest output confirms the new creation-retry
test was collected among28tests/11files; the earlier worker25/10count was stale.
