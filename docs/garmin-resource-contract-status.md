# Garmin Activity resource contract status

## Scope

This status records a **pure Activity PUSH parsing contract** only. It adds no
HTTP endpoint, authentication, receipt storage, queue, capability enablement,
file downloader, or product ingestion claim.

## Primary sources reviewed

- Garmin Developer Program, *Activity API*, version 2.0 (2026-10-15): PUSH
  list keys and records; Activity Details; Activity Files; Ping behavior.
- Garmin Connect Developer Program, *Start Guide*, version 2.0 (2026-10-15):
  access-level limits and server-to-server delivery.
- Garmin Connect Developer Program, *OAuth 2.0 PKCE Specification*, version
  2.0: deregistration notification and registration-deletion information.

## Resolved contract facts

- Starter Access permits up to **1,000 connected users**, uses **PUSH-only**
  delivery, and has **no historical-data access**. Enterprise terms differ.
- Garmin says PUSH has a **30-second timeout** and requires HTTP 200 before
  processing. A future receiver must durably accept a receipt before returning
  200, then process expensive work asynchronously; this parser does not do so.
- Activity File callback URLs are one-time, available for **24 hours**, reject
  duplicate downloads with **HTTP 410**, and have a Starter limit of **50 per
  minute per client ID**. The parser accepts only the documented HTTPS origin
  and `/wellness-api/rest/activityFile` path; it never downloads or logs URLs.
- The reviewed Activity and Start Guide documents do not specify a signed
  payload, shared-secret header, or other documented PUSH authenticity method.
  A receiver must not treat parser success as sender authentication.
- The supplied Courses API PDF is not a Training API PDF and is not evidence
  that Courses can replace a Training API contract.

## Unresolved / intentionally unsupported

- No endpoint, durable receipt/idempotency design, queue, ownership mapping,
  or retry/reconciliation policy exists yet; this is not usable production
  ingestion.
- No Activity File downloader exists. One-time URL consumption, 24-hour expiry,
  HTTP 410, rate limiting, token-safe observability, and durable outcomes need
  a separate design before implementation.
- Move IQ is explicitly unsupported by this parser.
- OAuth documents deregistration notifications and remote registration deletion,
  but do not establish a confirmed local acknowledgement-loss rule. Do not
  infer one until a durable disconnect design and provider confirmation exist.
