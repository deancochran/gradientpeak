# Garmin connector runbook

## Supplied version 2.0 resources (2026-10-23)

The local `resources` directory supplies Activity API, Start Guide, OAuth2 PKCE, Health API, and Courses API PDFs, plus `TrainingAPIV22.0.zip` containing the Training specification and exercise spreadsheet. Training resources were inspected for the implemented run/bike subset; Courses describes routes, not structured workouts.

OAuth2 PKCE sections 5, 6, and 8 specify `https://apis.garmin.com/partner-gateway/rest/user/` for identity, registration deletion, and permissions. The implementation and endpoint assertions now follow these URLs rather than the older `wellness-api` user endpoints. Activity-file URLs remain governed separately by the Activity specification.

Activity API sections 4 and 6 establish PUSH envelopes and file metadata; sections 4/8 require HTTP 200 within 30 seconds and asynchronous processing. Persist receipt acceptance before acknowledgement. Activity-file callbacks are one-time downloads available for 24 hours; duplicate downloads return 410. Unknown download outcomes require recovery design, not blind replay. No activity deletion/tombstone or ordered revision contract was found.

OAuth section 7 documents `deregistrations` notifications for Garmin-side removal **and** application DELETE. Section 9 documents `userPermissionsChange` notifications. This provides a possible lost-DELETE-acknowledgement reconciliation signal, but the supplied documents do not specify how to authenticate incoming PUSH requests or bind delayed deregistration notifications to a reconnected generation. Do not remove credentials based on an unauthenticated `userId`, client-ID header, or ambiguous HTTP failure.

Remaining user-supplied evidence includes Garmin's supported webhook sender-verification configuration (for example, an API Tools authentication setting or a support-confirmed procedure). The Training documentation is no longer missing. A public client ID and forwarded headers are not sender authentication. Live OAuth and delivery evidence still require account-holder consent; no live account operation was performed during this resource review.

## Supported lifecycle

GradientPeak has a Garmin OAuth 2.0 lifecycle plus a **narrow locally-supported scheduled-workout subset**. It uses PKCE S256, captures identity and per-user permissions, supports remote user deregistration, and admits eligible scheduled run/bike sessions only when `WORKOUT_IMPORT` is present. Configure `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, and the existing `OAUTH_CALLBACK_BASE_URL` through the normal server runtime environment; do not place either Garmin credential in browser or mobile configuration. Missing or blank credentials disable the connector; no separate enable flag is required. Callback configuration must also be valid for connection setup. Presence checks establish local configuration, not remote credential acceptance: Garmin validates the credentials during OAuth.

The registered development callback is `https://dev.gradientpeak.com/api/integrations/callback/garmin`. The authorization endpoint is `https://connect.garmin.com/oauth2Confirm`, and the token endpoint is `https://diauth.garmin.com/di-oauth2-service/oauth/token` using `client_secret_post` and the state-bound PKCE verifier. `pnpm dev:web` uses the web app's ignored `.env.local` and `.env.tunnel`; the root `.env` alone is not loaded by that command. The tunnel configuration supplies the registered callback origin.

Garmin assigns application API scopes at registration. The connector intentionally sends no custom `scope` parameter. After consent it records the API user ID and the permissions returned by `GET https://apis.garmin.com/partner-gateway/rest/user/permissions`; those per-user permissions are not product capabilities.

## Current non-goals and verification boundary

### Outstanding-issue follow-up

The subsequent local cleanup passed `pnpm quality:agent:static` in full under Node 24.19.0, superseding the earlier static-quality blockers below. The full disposable DB gate also passed after refreshing obsolete verification fixtures; the final Garmin and planned-session/Wahoo PostgreSQL regressions passed (21 and 5 tests). Garmin is registered in the actual web worker registry. These checks used mocked provider transports and disposable databases, not live Garmin requests. Non-failing warnings remain; the broader `pnpm quality:agent` runtime/E2E profile and live account/device flows were not run.

No Garmin activity polling, history backfill, profile import, route delivery, completed-activity export, or webhook/push ingestion is enabled. The scheduled-workout worker and authenticated internal drain route are registered for eligible run/bike sessions in the 14-day window; its overview reports queued/syncing, recovery-required, unsupported-projection, and missing-grant states. This local registration and its disposable-DB tests are not live Garmin or device delivery proof.

Before disconnect, the runtime resolves a fresh access token using Garmin's recommended ten-minute safety margin. Expired tokens are refreshed outside database transactions. Short transactions claim a `garmin_token_refresh` receipt in the existing `provider_sync_jobs` table, then atomically persist the replacement credential pair only for the matching receipt owner, lease, credential generation, and integration generation. These receipts are not background jobs; no Garmin worker is registered. Concurrent callers receive a retryable busy result rather than redeeming the same rotating token twice. Receipts contain no credentials.

An expired claim or an unknown refresh result is not automatically replayed. The credential is marked for recovery. Active connections can reauthorize; pending disconnects remain pending rather than claiming remote consent was removed. The remaining provider and runtime validation below is still required for release readiness, independently of credential-based configuration.

## Disconnect and recovery

Disconnect first locks/checks the onboarding gate and credentials, then commits a generation-fenced `disconnect_pending` state and per-attempt receipt before calling `DELETE https://apis.garmin.com/wellness-api/rest/user/registration`. Concurrent attempts are rejected while the attempt lease is valid. Remote calls do not hold database locks. Successful deletion is finalized only for the matching pending generation and attempt; credentials are removed in that transaction.

A failed or unknown DELETE response retains the pending state and credentials. Both web and mobile expose an explicit retry instead of a permanent disabled spinner. Reconnect is blocked while consent removal is pending. No HTTP 401/404 or timeout is interpreted as successful deregistration. If Garmin accepted DELETE but its acknowledgement/local finalization was lost, a subsequent error can remain unresolved: provider-confirmed revocation/reconciliation semantics are required before automatic cleanup can be implemented. This is a release blocker, not a successful disconnect. Pending connections with unusable credentials likewise require confirmed remote consent removal; merely retrying cannot fix an invalid grant.

An HTTP 401 during deregistration conditionally expires only the rejected credential generation, so the next explicit retry refreshes it rather than reusing the rejected token. Missing connection configuration does not disable teardown: stored fresh access tokens remain usable for removal, and token maintenance uses the server client credentials independently of the callback setting. Keep those server credentials available while existing grants need maintenance. No local success is reported if remote removal cannot be confirmed.

## Planned-workout generation transitions

Reconnect advances the integration generation. Clean queued, failed, or expired running Garmin workout jobs from an older generation are retained for inspection but do not block admission, claiming, or current delivery status for the new generation. A durable pre-effect/recovery receipt is different: it remains an explicit recovery block across generations, is never cleared by reconnect, and never authorizes a duplicate request against the old remote resource. Overview `syncing` is scoped to a current-generation running job; old leases cannot make a reconnected account appear to be syncing.

## Verification and release boundaries

Local PostgreSQL tests use synthetic accounts and mocked Garmin calls, with cleanup limited to those fixtures. They cover competing claims, token rotation, failure-marker durability, abandoned claims, disconnect generation fences, missing credentials, onboarding gating, and explicit disconnect retry. Focused OAuth, capability, callback, Wahoo regression, web and native component tests are also available. They do not prove Garmin's real delivery contract or a live OAuth journey.

Current local verification on Node 24.19.0 includes 170 focused API tests, 73 web tests, 6 shared worker-loop tests, 5 disposable planned-session/Wahoo tests, and 21 disposable Garmin tests. Earlier relevant evidence remains 36 Core and 16 mobile tests passing. Final root `pnpm check-types` passed all 8 Turbo checks and the strictness ratchet: 3 current and 0 added exact-optional diagnostics, 0 current and 0 added unchecked-index diagnostics, without baseline widening. Bounded optional-property cleanup also passed 24 catalog-export, 201 UI web, and 232 UI native tests. `SUPABASE_DB_SHADOW_PORT=25420 pnpm db:verify` passed in full using the official temporary shadow-port override, without stopping stacks or changing an existing database. Root static quality remains blocked by unrelated format/import and architecture catalog/sample findings; no full-repository green gate, production image build, live Garmin account flow, or browser/device end-to-end verification is claimed.

Private documentation and a real developer-account roundtrip are still needed to confirm the connection and uncertain-removal recovery contracts. No live Garmin request or portal modification was performed during implementation. The public callback probe was rejected by Cloudflare with error 1010. Starter activity push ingestion and Training API export remain separate unimplemented milestones; supplying credentials does not enable those unsupported capabilities. No schema change or deployment is included.

## Completion checklist and delegated workstreams

The completion scope is Garmin connection lifecycle, new-activity ingestion, and structured-workout delivery. Health, Women's Health, Courses, and historical backfill are not implicitly included. Starter is push-only and does not include historical data. Credentials configure the connector; there is no separate enable flag.

Each of the four original unfinished items received a dedicated implementation assignment. Supporting changes are not counted as completion of the provider-dependent capability:

1. **Activity push ingestion — blocked on Garmin's exact delivery contract.** Shared bounded webhook reading and secret comparison now serve Wahoo and Strava. Remaining work includes documented authenticity, payload/version validation, immutable receipt before acknowledgement, owner and integration-generation matching, durable worker/retry/dead-letter recovery, canonical activity/FIT mapping, duplicate/update/delete convergence, permission/revocation notifications, and real delivery evidence. See [Activity ingestion](garmin-activity-ingestion.md).
2. **Training export — supported local subset; live evidence pending.** Dedicated tests prove that `WORKOUT_IMPORT` is necessary but insufficient: the connection must be active, the plan must project, and the registered worker must run; Garmin work never enters Wahoo's queue. The local subset covers scheduled run/bike time/distance prescriptions with fixed watts/bpm/cadence/speed or rest. Garmin Connect/device evidence remains pending. See [Training export](garmin-training-export.md).
3. **Disconnect reconciliation — provider-confirmed completion still blocked.** Local PostgreSQL fault injection verifies lost responses, ambiguous repeated 401/404, failed/expired local finalization, retained pending credentials, and sanitized recovery errors. Actual confirmed-revoked reconciliation needs Garmin's documented status/receipt/notification or repeated-DELETE semantics. See [Disconnect recovery](garmin-disconnect-recovery.md).
4. **Live OAuth roundtrip — local verification tooling delivered; external roundtrip unverified.** Shared non-secret readiness diagnostics cover all three executable OAuth providers and run against the real web environment loader. Remaining proof includes account-holder consent, reachable registered callback, encrypted persistence, denied/replayed callback behavior, web return, and a native-initiated mobile return. The local harness is not remote credential validation. See [OAuth verification](garmin-oauth-verification.md).

Cross-cutting acceptance requirements uncovered by the audit:

- **Ongoing permissions and revocation:** the public OAuth specification confirms `User_Permission` notifications exist, but their delivery/authenticity contract is missing. Current permissions are an OAuth-time snapshot. Data operations must not trust that snapshot indefinitely.
- **Account deletion:** no authoritative account/profile deletion orchestration was found in inspected auth/API/app code. Establish the owner and prove provider revocation/fencing precedes destructive credential deletion before exposing account deletion. Database cascades alone are insufficient; this task does not introduce a new account-deletion feature.
- **Duplicate policy:** keep provider-local idempotency and profile ownership constraints. Preserve existing conservative cross-provider probable-match review; automatic merging is a separate product decision, not an assumed Garmin requirement.
- **Operations and privacy:** production readiness still requires API Tools delivery setup, supported retries/rate limits, privacy-safe failure visibility, recovery procedures, provider attribution and data-retention/disclosure requirements from the partner terms, and scoped cross-provider regression evidence. No portal configuration, deployment, or schema change is implied by local implementation.

Shared organization deliberately stays narrow: existing provider manifests remain the capability authority; providers retain their own authentication, payload, scheduling, and revocation semantics. No hypothetical universal Training adapter or new queue was introduced.

The current verification note above supersedes older aggregate test and workspace-quality counts. Fixture and environment-loaded readiness commands passed without provider requests or secret output. Independent review findings for header-rejection stream cancellation and worker-backed capability reporting were corrected and regression-tested.

## Sources

Garmin Connect Developer Program, *OAuth2.0 PKCE Specification*, sections “Authorization Request”, “Access Token Request”, “Refresh Token”, “User ID”, “Delete User Registration”, and “User Permission endpoint”: <https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf>.
