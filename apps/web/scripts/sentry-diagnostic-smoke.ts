import {
  captureApiErrorWithEventId,
  flushApiTelemetry,
  getApiTelemetryOptions,
} from "@repo/api/telemetry";

if (process.env.APP_ENV !== "development") {
  throw new Error("The Sentry diagnostic smoke event only runs in development.");
}
const options = getApiTelemetryOptions();
if (!options || options.environment !== "development" || options.dsn !== process.env.SENTRY_DSN) {
  throw new Error("An active development Sentry client with the configured DSN is required.");
}

const cause = Object.assign(new Error("Synthetic missing column"), {
  code: "42703",
  name: "PostgresError",
});
const result = captureApiErrorWithEventId(new Error("Synthetic API boundary failure", { cause }), {
  procedure: "diagnostics.syntheticMissingColumn",
  procedure_type: "query",
});

if (!result.captured || !result.eventId) {
  throw new Error("The synthetic Sentry event was not submitted to an active client.");
}
if (!(await flushApiTelemetry(2_000))) {
  throw new Error("The synthetic Sentry event did not flush.");
}

console.log(`Submitted one synthetic sanitized diagnostic event: ${result.eventId}`);
