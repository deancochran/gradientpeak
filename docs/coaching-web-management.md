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

## Authorized retained E2E recovery

User subsequently approved the proposed data-preserving retained-E2E upgrade,
including private backup, isolated restore rehearsal and before/after checks;
no reset/reseeding or hook bypass. Target identity was verified as Docker project
gradientpeak_e2e, database postgres, loopback55322, PostgreSQL17.6. This approval
does not change preview data or authorize unrelated target upgrades.

Private custom-format recovery archive and inventory are retained outside Git in
coordination cache `retained-e2e-upgrade-w2zQgH` (archive mode0600). Complete
schema diff is limited to nine missing tables/dependencies and replacement of
coaching_athlete_read_access_decision; there are no unrelated changed existing
columns/indexes/constraints. Migration ledger stays unchanged.

Full archive restoration into a generated disposable database passed exact schema
comparison and count/content-hash comparison for102public/auth/storage/ledger
tables. Standard logical restore compacted old dropped-column ordinal gaps;
rehearsal now reconstructs inert placeholder slots in the disposable copy's
pre-data CREATE statements, then drops only those placeholders before data restore.
This preserves physical column positions without weakening the fingerprint or
changing any retained table. Restoring full platform ownership uses local
supabase_admin only on the generated disposable database. All rehearsal copies
were cleaned by the existing guarded disposable lifecycle. The one-time bounded
upgrade runner is in progress; retained upgrade has not yet been applied.

The complete restore-plus-upgrade rehearsal subsequently passed: exact final
fingerprint and all102pre-existing table counts/content hashes preserved, with a
private receipt bound to the archive and SQL/fingerprint digests. Coordinator
Node24 DB typecheck, scoped Biome, generated-prerequisite refusal/replay tests and
full `pnpm --filter @repo/db db:verify` passed, including two fresh verification
runs, schema/security/storage parity, lint, authorization/concurrency and query
plan checks. Independent operational safety reviews remain in flight; no retained
upgrade application is claimed yet.

Operational review blocked activation pending stronger URL and archive-data
binding. Routing query parameters must be rejected; the receipt must include a
server/container identity and SHA-256 content digests for the reviewed102-table
inventory. Activation must compare those against its locked live pre-upgrade
state, not merely compare schema and caller-provided target strings. Rehearsal
review found no retained-write path but recommended pinning the table inventory.
These guards are being repaired before activation. Read-only privilege checks
found four platform tables require the local supabase_admin role for exclusive
locking; its read-only connection was verified. Any elevated activation must
restore the postgres DDL role so new object ownership/ACLs remain canonical.

## Retained E2E activation completed

All operational findings were resolved: connection-routing overrides rejected,
actual container/server/database identity bound to receipt, SHA-256 row/aggregate
digests for the reviewed102-table inventory compared with locked live data, and
post-inventory required to equal those102tables plus exactly nine new public
tables. Reviewer withdrew a mistaken clone-port finding after confirming source
uses54322for the disposable clone and55322only for retained source. Final targeted
refusal/replay/post-inventory tests, typecheck and complete restore+upgrade
rehearsal passed before activation.

Coordinator applied the approved transaction under exclusive recovery lock.
The runner committed only after full schema and all pre-existing data digests
matched. `db:e2e:status` now passes: project gradientpeak_e2e running,
migrations=1, schema-fingerprint=4a976d8f8189. No reset/reseed/ledger edits or data
replacement occurred. Private backup, bound receipt and activation evidence
remain in the recovery directory above. Only the verified obsolete E2E Vite
PID2807873 (verification-user-journeys, port3001, started October30) was stopped
to quiesce its retained-target access; preview3000was not touched. Normal
publication dashboard smoke is being rerun on the repaired prerequisite.

## Approved auth identity compatibility (PR #113)

User approved the additional auth schema/source and preserved preview/E2E
cutover, and subsequently authorized merge without another manual approval.
Required checks and branch protections remain mandatory; no bypass is authorized.

Better Auth 1.7.1 introduced required issuer values that 1.7.3+ no longer writes.
The coordinated 1.7.15 update retains issuer values/column, relaxes nullability,
and replaces issuer/account uniqueness with provider/account uniqueness. Both
preserved targets had zero duplicate provider/account identities in read-only
preflight; activation repeats the check under locks. No account merge/deletion,
reset/reseed, or ledger modification is part of this change.

The aligned dependency graph uses better-call 1.4.4 and Zod ^4.5.4. Coordinator
checks passed: 65 auth tests, shared/web/mobile typechecks, 6 native-client Jest
tests, and 19 disposable browser journeys covering sign-up, verification expiry
and replay, sign-in, persistence, logout, password reset and session revocation.
The full DB verification passed on the initial DB implementation; the final
operational tooling and dependency graph are undergoing the same gate again.

Distinct private archives and full isolated restore-plus-upgrade rehearsals for
preview and E2E passed, preserving all 111 public/auth/storage/ledger table
counts and SHA-256 digests for each target. Private artifacts live in coordination
cache auth-identity-upgrade-noBVl2, not Git. Activation requires the same source
identity and locked data map; a stale/different target refuses before DDL. No
live auth compatibility activation is claimed at this checkpoint.

Latest published CI also exposed missing DATABASE_URL in the browser test
process; the guarded CI helper now derives/masks both database URL variables
from the verified E2E container, rather than only configuring its web child.
Other latest CI blockers remain: live-DB fixture/contract failures (activity
ingestion operation identity, artifact cleanup, retired activity_efforts column,
event occurrence identity), audit/image vulnerabilities, and CodeQL findings.
These are not cleared by auth/browser evidence or by merge authorization.

Final Node 24 DB verification, DB typecheck, and architecture check passed with
operational and sequential-upgrade proofs included. The strengthened public
browser regression passed 2/2: it inspects the actual adapter-created credential
row (null issuer and expected provider/account identity), then sets a legacy
issuer on its owned synthetic actor and proves sign-in/reload/logout still work.
Frozen install passed. Current local audit reports zero Better Auth advisory
records, but totals remain 10 critical, 54 high, 71 moderate, and 17 low; this is
not a general audit clearance. The guarded CI environment helper passed 7 tests
and actual local-container derivation without revealing credential values.

Operational review hardening pins the complete 111-table inventory and rejects
unexpected platform/ledger tables. Private recovery directories/files must be
owned and non-symlinked; outputs use exclusive no-follow 0600 temporary files,
fsync, and atomic rename, with unsafe-existing-file refusal tests. Node 24 auth
upgrade/operation/chain tests passed. Fresh full archive rehearsals after these
fixes passed for both targets using cache auth-identity-final-zPpJqT.

A separate actual runtime proof created a synthetic credential account under the
exact legacy schema before upgrading, using the application's bcrypt cost-10
password format. After the guarded upgrade, createGradientPeakAuth 1.7.15's
sign-in handler returned 200 and cookie-session lookup returned the same user.
The child runtime exited before guarded disposable cleanup. This does not require
or expose any preserved user's password. Initial scratch attempts uncovered test
setup omissions (pgcrypto and the application's custom bcrypt format); only the
corrected successful run is acceptance evidence. It complements—not replaces—the
full archive data-preservation rehearsals.

## Auth compatibility activated

After independent review found no remaining source blocker and fresh hardened
rehearsals passed, coordinator activated E2E under its recovery lock and preview
under the shared-preview lock. Both committed only after exact schema, immutable
111-table inventory and all pre-existing data digests matched the receipts.
No account/issuer values or ledger rows were changed. E2E status passes with
one ledger migration and fingerprint a50696bcf0ed.

Preview contains checkpoint 24179eaf7d88ede26b8a5e4672767732529a6f65 at merge
e6d4a3d69c09f5e53ebb3c72dd36b19f7870b8eb. Owned web/Metro were stopped before
frozen dependency installation and returned to their prior active state.
Ancestry, web health, Metro status and unauthenticated auth session lookup with
the current epoch-3 header passed (returns null). Missing/stale epoch probes
correctly returned 412. No native binary was replaced. This is live preview
delivery, not main merge or clearance of the remaining release checks.
