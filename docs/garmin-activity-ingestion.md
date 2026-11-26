# Garmin activity ingestion status

## Status: blocked on the provider contract

GradientPeak does **not** implement Garmin activity push ingestion. The existing
Garmin connector is connection-only; no Garmin ingestion route, parser, worker,
queue, or capability claim is added by this document.

The available public OAuth 2.0 PKCE specification establishes that Garmin sends
PUSH and PING notifications containing the stable Garmin user ID, and that a
`User_Permission` webhook notifies post-consent permission changes. It does not
provide the exact Activity-push delivery contract required to safely ingest an
activity: endpoint registration, payload schema/versioning, delivery identity,
authentication or signature verification over raw bytes, retry/acknowledgement
semantics, or the API/FIT retrieval and deletion/edit reconciliation contract.
The program documentation URL remains access-gated (HTTP 403) in this checkout.

Do not infer those details from another Garmin program or provider. In
particular, a user ID in a notification does not authenticate its sender.

## Required contract and data-flow checklist

Before implementing an Activity-push adapter, obtain the approved Garmin
developer-program documentation or written provider confirmation for every
unchecked item:

- [ ] Activity notification endpoint registration and allowed transport methods.
- [ ] Exact payload schema, field meanings, units, timestamps/time zones, and
      version compatibility policy.
- [ ] Delivery authenticity mechanism, including canonical raw-byte input,
      secret/key lifecycle, replay protection, and key rotation.
- [ ] Maximum payload size, content encoding, timeout, acknowledgement status,
      and retry schedule.
- [ ] Stable delivery identifier and activity/version identifiers suitable for
      receipt idempotency and edit/delete convergence.
- [ ] Mapping from Garmin user ID to the current owned connection and behavior
      for disconnected, revoked, or generation-stale connections.
- [ ] Activity data retrieval/FIT-download contract, authorization method,
      pagination/history behavior, and rate/error limits.
- [ ] Activity deletion, correction, privacy, and permission-change signals;
      reconciliation policy for missed or out-of-order notifications.
- [ ] Provider-approved non-production test fixture or sandbox delivery method.

Once these are available, the expected data flow is:

1. Authenticate and byte-bound the raw notification before parsing.
2. Resolve the Garmin user to an active, generation-current owned connection.
3. Persist an immutable, idempotent receipt before acknowledging delivery.
4. Enqueue the existing canonical import seam with the documented activity and
   version identity; workers retrieve/map data only under that receipt.
5. Record retryable versus terminal outcomes without treating an acknowledgement
   loss as a lost durable receipt; reconcile edits, deletions, and missed events
   using the documented provider contract.

This is a checklist, not a claim that the listed data flow has been implemented.

## Verified shared prerequisite

`apps/web/src/lib/provider-webhook-http.ts` centralizes only HTTP mechanics used
by the existing Wahoo and Strava webhook handlers: bounded raw UTF-8 reading,
stream cancellation/release, constant-time digest comparison, and an explicit
per-provider malformed-`Content-Length` policy. It does not parse Garmin data,
authenticate Garmin deliveries, establish Garmin ownership, persist a Garmin
receipt, or enable a Garmin capability.

## Sources and blocker

- Garmin Connect Developer Program, *OAuth2.0 PKCE Specification*, “User ID”
  and “User Permission endpoint”, locally captured at
  `/tmp/opencode/garmin-oauth2-pkce.txt`.
- Garmin Developer Program documentation:
  <https://developerportal.garmin.com/developer-programs/programs-docs>
  (access-gated; exact Activity-push contract unavailable).

The next safe step is to obtain the provider-authorized Activity and push
documentation, then validate the checklist against the existing receipt,
ownership, generation, and canonical-import seams before exposing a handler.
