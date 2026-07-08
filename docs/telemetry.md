# Telemetry and MCP setup

GradientPeak can send local development and runtime telemetry to Sentry and PostHog. Both services can then be queried from an MCP-capable assistant.

## Runtime data flow

```text
local web/mobile/API runtime
  -> Sentry SDK for errors, crashes, traces, and source-map symbolication
  -> PostHog SDK for product events, screen/page views, feature flags, and session context
  -> Sentry MCP / PostHog MCP for assistant-side inspection
```

Telemetry is disabled when the relevant DSN/API key is blank.

## Environment files

- Web/API local development uses `apps/web/.env.local`, copied from `apps/web/.env.example`.
- Mobile local development uses `apps/mobile/.env`, copied from `apps/mobile/.env.example`.
- Mobile E2E uses `apps/mobile/.env.e2e`, copied from `apps/mobile/.env.e2e.example`.

Do not commit filled secret-bearing environment files.

## Sentry MCP template

Use a Sentry access token with read scopes first, such as `org:read`, `project:read`, and `event:read`. Add write scopes only if you want MCP to update/triage issues.

```json
{
  "mcpServers": {
    "sentry": {
      "command": "npx",
      "args": ["@sentry/mcp-server@latest"],
      "env": {
        "SENTRY_ACCESS_TOKEN": "YOUR_SENTRY_ACCESS_TOKEN",
        "MCP_SKILLS": "inspect,docs,triage"
      }
    }
  }
}
```

## PostHog MCP template

Use a PostHog personal API key with the MCP Server preset or read-focused scopes such as `query:read`, `feature_flag:read`, and `experiment:read`.

```json
{
  "mcpServers": {
    "posthog": {
      "type": "http",
      "url": "https://mcp.posthog.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_POSTHOG_PERSONAL_API_KEY"
      }
    }
  }
}
```

## Local smoke checks

After credentials are added, start the local web app with `pnpm --filter web dev`. The TanStack Start client loads `src/instrument.client.ts` before hydration, and the local dev server imports `instrument.server.mjs` through `NODE_OPTIONS`. The web runtime sends a `web_telemetry_initialized` PostHog event when browser telemetry is active. The API runtime sends a `server_telemetry_initialized` PostHog event when server telemetry is active.

For PostHog TanStack Start browser telemetry, prefer `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST`. `VITE_POSTHOG_KEY` remains supported as a fallback.

For mobile, set `EXPO_PUBLIC_ENABLE_SENTRY_IN_DEV=1` only when you intentionally want development errors to be sent to Sentry.
