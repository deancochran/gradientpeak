import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import {
  applySqlFile,
  bootstrapSupabaseAuthSchema,
  requireFreshBaseline,
  withDisposableDatabase,
  withDisposableSupabaseStorage,
} from "@repo/db/testing/disposable-database";
import { runAllCleanup, throwCleanupFailures } from "./disposable-acceptance-cleanup";
import { acceptanceOptions } from "./disposable-acceptance-options";

// This composes the DB-owned guarded lifecycle; it never migrates/resets an existing database.
const runId = `acceptance-${process.pid}-${Date.now()}`;
const captureAuthMail = process.env.E2E_CAPTURE_AUTH_MAIL === "1";
let interrupted = false;
let activeTests: ChildProcess | undefined;
function interrupt() {
  interrupted = true;
  if (activeTests?.pid && activeTests.exitCode === null) {
    try {
      process.kill(-activeTests.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
function requireActive() {
  if (interrupted) throw new Error("Acceptance interrupted; cleaning up owned resources");
}
const artifacts = resolve("../../.logs", runId);
mkdirSync(artifacts, { recursive: true, mode: 0o700 });
const probe = createServer();
const { args, native: requiresNativeCandidate } = acceptanceOptions(process.argv.slice(2));
probe.listen(requiresNativeCandidate ? 3100 : 0, "127.0.0.1");
await once(probe, "listening");
const address = probe.address();
if (!address || typeof address === "string") throw new Error("Missing acceptance listen address");
const port = address.port;
const browserOrigin = `http://127.0.0.1:${port}`;
await new Promise<void>((done) => probe.close(() => done()));

await withDisposableDatabase(
  ["--disposable", "--local"],
  "web_acceptance",
  async (target, connectionString) => {
    requireActive();
    await bootstrapSupabaseAuthSchema(target);
    await withDisposableSupabaseStorage(
      target,
      connectionString,
      async (storage) => {
        requireActive();
        await applySqlFile(target, requireFreshBaseline().sourcePath);
        const environment: NodeJS.ProcessEnv = {
          ...process.env,
          E2E_RUN_ID: runId,
          E2E_DISPOSABLE_DATABASE: "1",
          DATABASE_URL: connectionString,
          POSTGRES_URL: connectionString,
          APP_URL: browserOrigin,
          E2E_ACCEPTANCE_BASE_URL: browserOrigin,
          E2E_ACCEPTANCE_NATIVE: requiresNativeCandidate ? "1" : "0",
          PORT: String(port),
          OAUTH_CALLBACK_BASE_URL: browserOrigin,
          BETTER_AUTH_SECRET: `local-only-${runId}-synthetic-secret`,
          // Private file capture enables real signup/verification without external email.
          ...(captureAuthMail ? { NODE_ENV: "test" } : {}),
          AUTH_EMAIL_MODE: captureAuthMail ? "capture" : "disabled",
          AUTH_EMAIL_CAPTURE_PATH: resolve(artifacts, "auth-mail.jsonl"),
          AUTH_MOBILE_SCHEME: "gradientpeak-dev",
          AUTH_SMTP_HOST: "127.0.0.1",
          AUTH_SMTP_PORT: "55325",
          AUTH_SMTP_USER: "unused-local-acceptance",
          AUTH_SMTP_PASS: "unused-local-acceptance",
          AUTH_SMTP_SECURE: "false",
          // The acceptance-only Vite config replaces the provider model at the
          // host seam. Empty strings deliberately win over loaded .env values.
          OPENAI_API_KEY: "",
          TYPESAFE_API_KEY: "",
          NEXT_PRIVATE_SUPABASE_URL: storage.url,
          NEXT_PUBLIC_SUPABASE_URL: storage.url,
          NEXT_PRIVATE_SUPABASE_SECRET_KEY: storage.serviceRoleKey,
          SUPABASE_SERVICE_ROLE_KEY: storage.serviceRoleKey,
          SENTRY_DSN: "",
          VITE_SENTRY_DSN: "",
          POSTHOG_KEY: "",
          VITE_POSTHOG_KEY: "",
          VITE_POSTHOG_PROJECT_TOKEN: "",
          // The native app contains analytics hooks even while synthetic
          // acceptance has telemetry disabled. Give those hooks a disabled
          // local client so their missing-provider development toast cannot
          // cover a semantic Maestro action.
          EXPO_PUBLIC_POSTHOG_KEY: "disposable-telemetry-disabled",
          EXPO_PUBLIC_POSTHOG_HOST: browserOrigin,
          ENABLE_LOCAL_ERROR_LOG: "0",
          WAHOO_OAUTH_TEST_ADAPTER: "1",
          VITE_CACHE_DIR: resolve(artifacts, "vite"),
          NODE_OPTIONS: "--import ./instrument.server.mjs",
        };
        const log = openSync(resolve(artifacts, "web.log"), "a", 0o600);
        const server = spawn(
          "pnpm",
          [
            "exec",
            "vite",
            "dev",
            "--config",
            "vite.chatbot-acceptance.config.ts",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
            "--strictPort",
          ],
          {
            env: environment,
            stdio: ["ignore", log, log],
            detached: true,
          },
        );
        const serverExit = once(server, "exit");
        try {
          let ready = false;
          for (let attempt = 0; attempt < 120; attempt++) {
            requireActive();
            if (server.exitCode !== null)
              throw new Error("Acceptance web server exited before readiness");
            try {
              const response = await fetch(`${browserOrigin}/api/health`, {
                signal: AbortSignal.timeout(1000),
              });
              ready = response.ok;
              if (ready) break;
            } catch {}
            await new Promise((done) => setTimeout(done, 500));
          }
          if (!ready) throw new Error("Acceptance web server readiness timed out");
          console.log(`[acceptance] ready; run=${runId}; artifacts=${artifacts}`);
          let metro: ChildProcess | undefined;
          let metroExit: Promise<unknown> | undefined;
          let metroLog: number | undefined;
          const reversedPorts: number[] = [];
          let adb: ((command: string[]) => ChildProcess) | undefined;
          let forceStopNativeCandidate: (() => Promise<void>) | undefined;
          let runFailure: unknown;
          requireActive();
          try {
            if (requiresNativeCandidate) {
              const storagePort = Number(new URL(storage.url).port);
              if (!Number.isInteger(storagePort) || storagePort < 1 || storagePort > 65535)
                throw new Error(
                  "Disposable Storage must expose an explicit loopback port for Android",
                );
              environment.MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL = `lane=e2e api=127.0.0.1:3100 supabase=127.0.0.1:${storagePort}`;
              const adbCommand = (command: string[]) =>
                spawn("adb", ["-s", "emulator-5554", ...command], { stdio: "ignore" });
              adb = adbCommand;
              forceStopNativeCandidate = async () => {
                const stop = adbCommand([
                  "shell",
                  "am",
                  "force-stop",
                  "com.deancochran.gradientpeak.dev",
                ]);
                const [code] = await once(stop, "exit");
                if (code !== 0) throw new Error("Unable to stop the runner-owned native candidate");
              };
              // The previous disposable backend is about to be replaced. Stop only
              // the runner-owned app before it can retain authenticated async work
              // against that old endpoint; Maestro opens a fresh dev-client session.
              await forceStopNativeCandidate();
              const reversePort = async (port: number) => {
                const existing = spawnSync("adb", ["-s", "emulator-5554", "reverse", "--list"], {
                  encoding: "utf8",
                });
                if (existing.status !== 0)
                  throw new Error("Unable to inspect Android reverse mappings");
                const requested = `tcp:${port}`;
                const mapping = (existing.stdout ?? "")
                  .split("\n")
                  .map((line) => line.trim().split(/\s+/))
                  .find((tokens) => tokens.at(-2) === requested);
                if (mapping) {
                  if (mapping.at(-1) !== requested)
                    throw new Error(`Android port ${port} is already reversed by another process`);
                  return;
                }
                const reverse = adbCommand(["reverse", `tcp:${port}`, `tcp:${port}`]);
                const [code] = await once(reverse, "exit");
                if (code !== 0) throw new Error(`Unable to reverse Android port ${port}`);
                reversedPorts.push(port);
              };
              await reversePort(3100);
              await reversePort(storagePort);
              await reversePort(8083);
              metroLog = openSync(resolve(artifacts, "metro.log"), "a", 0o600);
              metro = spawn(
                "pnpm",
                ["exec", "expo", "start", "--dev-client", "--localhost", "--port", "8083"],
                {
                  cwd: resolve("../mobile"),
                  env: {
                    ...environment,
                    EXPO_NO_DOTENV: "1",
                    EXPO_NO_TELEMETRY: "1",
                    EXPO_PUBLIC_SENTRY_DSN: "",
                    SENTRY_AUTH_TOKEN: "",
                    SENTRY_ORG: "",
                    SENTRY_PROJECT: "",
                    SENTRY_DISABLE_AUTO_UPLOAD: "true",
                    DO_NOT_TRACK: "1",
                    // Expo's localhost mode otherwise selected the host's IPv6
                    // loopback here. The runner, its readiness probe, and ADB
                    // reverse deliberately use 127.0.0.1 for the disposable
                    // endpoint, so prefer IPv4 before Metro starts listening.
                    NODE_OPTIONS: "--dns-result-order=ipv4first",
                    EXPO_PUBLIC_MAESTRO_E2E: "1",
                    EXPO_PUBLIC_MAESTRO_E2E_API_URL: "http://127.0.0.1:3100",
                    EXPO_PUBLIC_MAESTRO_E2E_SUPABASE_URL: storage.url,
                    METRO_CACHE_DIR: resolve(artifacts, "metro-cache"),
                  },
                  stdio: ["ignore", metroLog, metroLog],
                  detached: true,
                },
              );
              metroExit = once(metro, "exit");
              let metroReady = false;
              for (let attempt = 0; attempt < 120; attempt++) {
                requireActive();
                if (metro.exitCode !== null)
                  throw new Error("Acceptance Metro exited before readiness");
                try {
                  const response = await fetch("http://127.0.0.1:8083/status", {
                    signal: AbortSignal.timeout(1000),
                  });
                  metroReady = response.ok;
                  if (metroReady) break;
                } catch {}
                await new Promise((done) => setTimeout(done, 500));
              }
              if (!metroReady) throw new Error("Acceptance Metro readiness timed out");
            }
            const tests = spawn(
              process.execPath,
              [
                "scripts/run-playwright.mjs",
                "--config=playwright.acceptance.config.ts",
                ...(args.length
                  ? args
                  : [
                      "e2e/specs/core-acceptance.spec.ts",
                      "e2e/specs/chatbot.spec.ts",
                      "--project=Desktop Chrome",
                    ]),
              ],
              {
                env: { ...environment, NODE_OPTIONS: "" },
                stdio: "inherit",
                detached: true,
              },
            );
            activeTests = tests;
            const [code] = await once(tests, "exit");
            activeTests = undefined;
            requireActive();
            if (code !== 0) throw new Error(`Acceptance tests failed (exit ${code})`);
          } catch (error) {
            runFailure = error;
            throw error;
          } finally {
            // Stop the app while this run's Metro and API are still available so
            // no task survives into the next disposable backend lifecycle.
            const cleanupFailures = await runAllCleanup([
              async () => forceStopNativeCandidate?.(),
              async () => {
                if (metro?.pid && metro.exitCode === null) process.kill(-metro.pid, "SIGTERM");
                await metroExit;
              },
              () => {
                if (metroLog !== undefined) closeSync(metroLog);
              },
              async () => {
                const reverseCleanup = await Promise.allSettled(
                  reversedPorts.map(async (port) => {
                    if (!adb) return;
                    const remove = adb(["reverse", "--remove", `tcp:${port}`]);
                    await once(remove, "exit");
                  }),
                );
                const failures = reverseCleanup.flatMap((result) =>
                  result.status === "rejected" ? [result.reason] : [],
                );
                if (failures.length > 0)
                  throw new AggregateError(failures, "Android reverse cleanup failed");
              },
            ]);
            throwCleanupFailures(cleanupFailures, runFailure);
          }
        } finally {
          if (server.pid && server.exitCode === null) process.kill(-server.pid, "SIGTERM");
          await serverExit;
          closeSync(log);
        }
      },
      { temporaryDirectory: artifacts, browserOrigin },
    );
  },
);
process.off("SIGINT", interrupt);
process.off("SIGTERM", interrupt);
