# Development Errors

Set `ENABLE_LOCAL_ERROR_LOG=1` in the web development environment to write sanitized unexpected API errors to the repository-local `.logs/dev-errors.jsonl`. The directory and files are owner-only, symlinks are rejected, and the file rotates at 1 MB with one `.1` backup. `LOCAL_ERROR_LOG_PATH` is optional only for an absolute filename directly inside that same `.logs` directory; other paths are rejected.

Run `pnpm dev:errors` to print grouped recent errors and the latest safe record. It does not start a server or read console output.

Automated web E2E and Maestro fixture runs disable Sentry and local error logging even when a developer environment has telemetry configured. Ordinary development remains opted in and captures sanitized user-development errors.

Sentry development events use the `development` environment. In the Sentry MCP, filter project `gradientpeak` by `environment:development`.

For an explicitly approved smoke check only, run `pnpm --filter web sentry:smoke`. It invokes the same API error capture boundary with a fixed synthetic `PostgresError` cause carrying SQLSTATE `42703`, then attempts to flush one event. It refuses missing/inactive configuration or non-development environments and does not use user traffic. Submission/flush alone is not proof of delivery: retrieve that event through MCP afterward. Do not run this command automatically during tests or agent startup.

## Coverage and startup

- Restart the web/API and Metro development processes after changing their environment. Reload/restart the native app to initialize its configured SDK. Source-map upload for packaged builds remains a separate release concern.
- The local file contains unexpected API failures routed through `captureApiError`, not every terminal message. Metro/Vite compiler errors, startup failures, and arbitrary worker `console.error` calls still require their originating terminal output. Do not scrape raw input/output payloads into the sanitized file.
- Runtime browser/native exceptions use Sentry. The mobile tRPC console logger emits sanitized failures without repeating server exceptions as new Sentry issues. Missing Sentry results do not prove that no runtime errors occurred.
- Recorded fields include procedure, operation type, error class, safe reason, and PostgreSQL error code when available. Unknown free-text messages are replaced by a safe summary; raw SQL, parameters, request bodies, credentials and personal data are not emitted. Symbolication-safe source frames remain available in Sentry.
- `pnpm dev:errors` and Sentry MCP are on-demand inspection tools, not a continuously running agent subscription.

## Sentry-side privacy setting

Sentry can derive geographic metadata from the transport IP after the SDK has removed `user` and `request`. SDK scrubbing alone does not prevent this. In the project's **Security & Privacy** settings, enable prevention of IP storage and add the Advanced Data Scrubbing rule **Remove Anything from `$user.geo.**`**. Organization-level rules may override project settings.

The connected MCP exposes project metadata editing, but not this scrubbing-rule setting. It must be configured through an authorized Sentry settings interface; do not claim it is enabled from SDK tests. The approved synthetic event verification on 2026-09-15 confirmed API-to-Sentry-to-MCP delivery and the local file, but also revealed Sentry-added geographic metadata. No further test events were sent.

Reference: https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/
