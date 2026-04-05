# Strava Integration Capability

Load only for Strava-specific OAuth, sync, webhook, or payload-mapping work.

Focus:
- Keep Strava-specific behavior isolated to Strava seams.
- Normalize Strava payloads into shared contracts before reuse.
- Re-check dedupe, retry, and webhook signature assumptions when changing sync flow.

Important paths:
- `apps/web/src/app/api/integrations/`
- `apps/web/src/app/api/webhooks/`
- `packages/api/src/routers/integrations.ts`

Verify with:
- focused integration tests for the changed Strava path
- relevant `apps/web` or `packages/api` checks for touched files

References:
- `https://developers.strava.com/docs/`
- `https://developers.strava.com/docs/webhooks/`
