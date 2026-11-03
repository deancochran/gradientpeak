#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PROJECT = "gradientpeak_e2e";
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1"]);
const REQUIRED_CONTAINERS = {
  database: "supabase_db_gradientpeak_e2e",
  gateway: "supabase_kong_gradientpeak_e2e",
  storage: "supabase_storage_gradientpeak_e2e",
};

function requireSafeSecret(value, name) {
  if (!value || /[\r\n]/.test(value)) {
    throw new Error(`Required E2E ${name} is unavailable.`);
  }
  return value;
}

function requireContainer(inspections, name) {
  const inspection = inspections.find((candidate) => candidate.Name === `/${name}`);
  if (
    !inspection ||
    inspection.Config?.Labels?.["com.docker.compose.project"] !== PROJECT ||
    inspection.Config?.Labels?.["com.supabase.cli.project"] !== PROJECT
  ) {
    throw new Error("Required E2E Supabase container identity did not match gradientpeak_e2e.");
  }
  return inspection;
}

function requireLoopbackPort(inspection, containerPort, hostPort) {
  const bindings = inspection.NetworkSettings?.Ports?.[containerPort] ?? [];
  if (
    !bindings.some(
      (binding) => binding.HostPort === hostPort && LOOPBACK_ADDRESSES.has(binding.HostIp),
    )
  ) {
    throw new Error(`Required E2E Supabase port ${hostPort} was not bound to loopback.`);
  }
}

function requireOnlyLoopbackBindings(inspections) {
  for (const inspection of inspections) {
    for (const bindings of Object.values(inspection.NetworkSettings?.Ports ?? {})) {
      for (const binding of bindings ?? []) {
        if (!LOOPBACK_ADDRESSES.has(binding.HostIp)) {
          throw new Error("Required E2E Supabase container published a non-loopback port.");
        }
      }
    }
  }
}

export function deriveRuntimeWebE2EEnvironment({
  inspections,
  environment = process.env,
  random = randomBytes,
}) {
  const database = requireContainer(inspections, REQUIRED_CONTAINERS.database);
  const gateway = requireContainer(inspections, REQUIRED_CONTAINERS.gateway);
  const storage = requireContainer(inspections, REQUIRED_CONTAINERS.storage);
  requireOnlyLoopbackBindings([database, gateway, storage]);
  requireLoopbackPort(database, "5432/tcp", "55322");
  requireLoopbackPort(gateway, "8000/tcp", "55321");

  const serviceKey = requireSafeSecret(
    storage.Config?.Env?.find((entry) => entry.startsWith("SERVICE_KEY="))?.slice(
      "SERVICE_KEY=".length,
    ),
    "Storage service credential",
  );
  const authSecret = requireSafeSecret(
    environment.BETTER_AUTH_SECRET ?? `e2e-${random(32).toString("base64url")}`,
    "Better Auth secret",
  );
  return {
    BETTER_AUTH_SECRET: authSecret,
    NEXT_PRIVATE_SUPABASE_SECRET_KEY: serviceKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  };
}

export function formatGitHubMaskCommand(value) {
  return `::add-mask::${value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}\n`;
}

export function prepareRuntimeWebE2E({
  inspect = () =>
    JSON.parse(
      execFileSync("docker", ["inspect", ...Object.values(REQUIRED_CONTAINERS)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ),
  environment = process.env,
  addMask = (value) => process.stdout.write(formatGitHubMaskCommand(value)),
  appendEnvironment = (line) => appendFileSync(environment.GITHUB_ENV, line),
  random = randomBytes,
} = {}) {
  let inspections;
  try {
    inspections = inspect();
  } catch {
    throw new Error("Could not inspect the required guarded E2E Supabase stack.");
  }
  const runtimeEnvironment = deriveRuntimeWebE2EEnvironment({ inspections, environment, random });
  if (!environment.GITHUB_ENV) {
    throw new Error("GitHub Actions environment file is required for browser runtime preparation.");
  }
  for (const [key, value] of Object.entries(runtimeEnvironment)) {
    addMask(value);
    appendEnvironment(`${key}=${value}\n`);
  }
  console.info("[runtime-web] guarded E2E credentials prepared.");
  return runtimeEnvironment;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    prepareRuntimeWebE2E();
  } catch (error) {
    console.error(`[runtime-web] ${error instanceof Error ? error.message : "Unknown failure."}`);
    process.exitCode = 1;
  }
}
