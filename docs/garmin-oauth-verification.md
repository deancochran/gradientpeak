# Garmin OAuth verification

## Purpose and safety boundary

Use this procedure to prepare and document a **human-consented** Garmin OAuth connection check. The local readiness harness reports only configuration presence, callback-base validity, direct runtime operations, declared supported capabilities, and worker requirements. Worker-backed features are not mislabeled as unimplemented merely because they are absent from the direct runtime list. It does not print credentials, tokens, authorization URLs, callback-base values, or provider endpoints.

Configuration presence does not prove that Garmin accepts the registered client credentials or callback. Garmin's developer portal and a user-approved consent journey are the authority for that evidence. The connector remains connection-only: activity import, FIT download, workout/route delivery, and Garmin push ingestion are not enabled.

## Local preflight

From the repository root, with Node 24.19.0 available:

```sh
PATH=/home/deancochran/.local/share/mise/installs/node/24.19.0/bin:$PATH \
  pnpm --filter @repo/api exec tsx scripts/check-provider-readiness.ts --fixture
```

Expected result: `mode` is `fixture`; Wahoo, Strava, and Garmin are enumerated; Garmin is locally configured in the synthetic fixture; and Garmin lists only `oauth_authorization`, `oauth_callback`, and `disconnect`. This does not read local credential values or contact a provider.

For a local presence-only check, use the same environment files and precedence as the tunnel-backed web server. Running the bare script without this loader inspects only the current shell environment and may report missing credentials even when the app is configured. Output contains statuses only; never paste the environment file contents into tickets.

```sh
PATH=/home/deancochran/.local/share/mise/installs/node/24.19.0/bin:$PATH \
  pnpm --dir apps/web exec dotenv -o -e .env.local -e .env.tunnel -- \
    tsx ../../packages/api/scripts/check-provider-readiness.ts
```

Before a live attempt, verify that the server runtime (not browser/mobile config) has nonblank `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, and a valid `OAUTH_CALLBACK_BASE_URL`. The expected registered path is `/api/integrations/callback/garmin`; registration must use the complete callback derived from that base. No enable flag is needed: credentials and a valid callback base control connection admission.

## Human-consented live roundtrip

1. An authorized developer verifies the registered callback in Garmin's portal. Do not change portal settings during this procedure.
2. Start the existing tunnel-backed development server using the approved local environment. It loads `apps/web/.env.local` and `.env.tunnel`; the repository-root `.env` alone is not sufficient for `pnpm dev:web`.
3. In a controlled browser session, sign in to a designated non-production GradientPeak account and choose Garmin Connect. Confirm the normal authorization request uses the registered callback and S256 PKCE.
4. The account holder signs in to Garmin and explicitly approves access. Do not automate credentials, consent, or callback navigation.
5. Confirm the application returns to the normal callback route and records the connected state without exposing authorization codes, tokens, IDs, or permission payloads in screenshots, logs, or tickets.
6. Record only nonsecret evidence: date/time, environment, callback outcome, connection-state outcome, and any sanitized error category. A successful browser redirect alone is insufficient; record whether the application reached its connected state.
7. Do **not** test deregistration as part of this smoke check. It has separate remote-consent recovery requirements.

## Current live-proof blocker

No live Garmin OAuth roundtrip has been executed here. It requires an authorized human account holder, the registered development callback/tunnel, and a browser session. A prior no-code/no-state callback probe was rejected by Cloudflare error 1010; that is connectivity evidence only and neither validates nor invalidates Garmin OAuth credentials or the callback contract.

The environment-loaded preflight was run locally and reported credentials present, callback configuration valid, and local configuration available for Wahoo, Strava, and Garmin. No provider request was made. An attempt to open the integration page through the browser tool was unavailable because no controllable OpenChamber desktop client was connected.
