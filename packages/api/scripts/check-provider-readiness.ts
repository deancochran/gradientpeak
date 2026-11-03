import { readProviderReadiness } from "../src/application/integrations/provider-readiness";

const argumentsAfterScript = process.argv.slice(2);
const fixtureMode = argumentsAfterScript.includes("--fixture");

if (argumentsAfterScript.some((argument) => argument !== "--fixture")) {
  console.error("Usage: tsx scripts/check-provider-readiness.ts [--fixture]");
  process.exitCode = 2;
} else {
  // Fixture mode uses inert literals only. It makes no network request and never prints values.
  const env = fixtureMode
    ? {
        GARMIN_CLIENT_ID: "fixture-client-id",
        GARMIN_CLIENT_SECRET: "fixture-client-secret",
        STRAVA_CLIENT_ID: "fixture-client-id",
        STRAVA_CLIENT_SECRET: "fixture-client-secret",
        WAHOO_CLIENT_ID: "fixture-client-id",
        WAHOO_CLIENT_SECRET: "fixture-client-secret",
        OAUTH_CALLBACK_BASE_URL: "https://fixture.example.test",
      }
    : process.env;

  console.log(
    JSON.stringify(
      {
        mode: fixtureMode ? "fixture" : "environment-presence-only",
        providers: readProviderReadiness(env),
        limitations: [
          "This is a local configuration diagnostic, not provider credential validation.",
          "No network request, authorization URL, token exchange, or callback is performed.",
        ],
      },
      null,
      2,
    ),
  );
}
