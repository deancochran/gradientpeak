import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadEnv } from "vite";
import {
  applyE2EFileEnvironment,
  localE2EDatabaseEnvironment,
} from "../e2e/support/database-url.ts";

const E2E_WEB_URL = "http://127.0.0.1:3100";
const E2E_SUPABASE_URL = "http://127.0.0.1:55321";

export function resolveE2EWebEnvironment(environment = process.env) {
  requireDedicatedValue(environment.E2E_WEB_PORT, "E2E_WEB_PORT", "3100");
  requireDedicatedValue(environment.PORT, "PORT", "3100");
  requireDedicatedValue(environment.APP_URL, "APP_URL", E2E_WEB_URL);
  requireDedicatedValue(
    environment.NEXT_PRIVATE_SUPABASE_URL,
    "NEXT_PRIVATE_SUPABASE_URL",
    E2E_SUPABASE_URL,
  );
  requireDedicatedValue(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
    E2E_SUPABASE_URL,
  );

  const databaseEnvironment = localE2EDatabaseEnvironment(environment);
  return {
    ...databaseEnvironment,
    APP_URL: E2E_WEB_URL,
    OAUTH_CALLBACK_BASE_URL: E2E_WEB_URL,
    NEXT_PRIVATE_SUPABASE_URL: E2E_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
    PORT: "3100",
    VITE_CACHE_DIR:
      environment.VITE_CACHE_DIR ??
      `/tmp/gradientpeak-web-vite-e2e-${environment.E2E_RUN_ID ?? process.pid}`,
  };
}

function requireDedicatedValue(value, variable, expected) {
  if (value !== undefined && value !== expected) {
    const requirement = variable.endsWith("SUPABASE_URL")
      ? `${variable} to use E2E Supabase URL ${expected}`
      : `${variable}=${expected}`;
    throw new Error(`Web E2E launcher requires ${requirement}.`);
  }
}

function startE2EWeb() {
  const fileEnvironment = loadEnv("test", process.cwd(), "");
  applyE2EFileEnvironment(
    process.env,
    Object.fromEntries(
      ["DATABASE_URL", "POSTGRES_URL"].flatMap((key) =>
        fileEnvironment[key] === undefined ? [] : [[key, fileEnvironment[key]]],
      ),
    ),
  );
  const environment = {
    ...resolveE2EWebEnvironment(process.env),
    NODE_OPTIONS: "--import ./instrument.server.mjs",
    // The isolated E2E server must never navigate tests into the real provider OAuth flow.
    WAHOO_OAUTH_TEST_ADAPTER: "1",
  };
  const protectedEnvironmentArguments = Object.entries(environment).flatMap(([name, value]) => [
    "-v",
    `${name}=${value}`,
  ]);
  console.log(
    `[e2e-web] local OAuth adapter: ${environment.WAHOO_OAUTH_TEST_ADAPTER === "1" ? "enabled" : "disabled"}`,
  );
  const child = spawn(
    "pnpm",
    [
      "exec",
      "dotenv",
      "-o",
      "-e",
      ".env.local",
      ...protectedEnvironmentArguments,
      "--",
      "vite",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      "3100",
      "--strictPort",
    ],
    {
      env: {
        ...process.env,
        ...environment,
      },
      stdio: "inherit",
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
  child.on("error", (error) => {
    console.error(`Could not start the isolated web E2E server: ${error.message}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startE2EWeb();
}
