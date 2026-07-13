#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { dbPackageRoot, prepareDbEnv, runSupabaseCli, supabaseCliRoot } from "./_helpers";

function getSupabaseProjectId() {
  const configToml = readFileSync(`${supabaseCliRoot}/config.toml`, "utf8");
  const match = configToml.match(/^project_id\s*=\s*"([^"]+)"/m);

  if (!match?.[1]) {
    throw new Error(
      "Unable to determine Supabase project_id from packages/db/supabase/config.toml",
    );
  }

  return match[1];
}

function readSupabaseConfigToml() {
  return readFileSync(`${supabaseCliRoot}/config.toml`, "utf8");
}

function getConfiguredLocalSmtpPort() {
  const configToml = readSupabaseConfigToml();
  const localSmtpSection = configToml.match(/\[local_smtp\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  const match = localSmtpSection?.match(/^smtp_port\s*=\s*(\d+)/m);

  if (!match?.[1]) {
    return null;
  }

  return Number(match[1]);
}

function getSupabaseMailpitContainerName() {
  return `supabase_inbucket_${getSupabaseProjectId()}`;
}

function isContainerRunning(name: string) {
  try {
    const output = execFileSync("docker", ["ps", "-q", "-f", `name=^${name}$`], {
      stdio: "pipe",
      encoding: "utf8",
    }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

function showMailpitStatus() {
  const supabaseMailpitContainerName = getSupabaseMailpitContainerName();
  const supabaseMailpitRunning = isContainerRunning(supabaseMailpitContainerName);
  const configuredLocalSmtpPort = getConfiguredLocalSmtpPort();
  console.info(`Supabase Mailpit UI: ${supabaseMailpitRunning ? "running" : "stopped"}`);

  if (configuredLocalSmtpPort) {
    console.info(
      `Mailpit SMTP: 127.0.0.1:${configuredLocalSmtpPort} (direct from Supabase Mailpit)`,
    );
  } else {
    console.info("Mailpit SMTP: not exposed by Supabase config");
  }
  console.info("Mailpit UI: http://127.0.0.1:54324");
}

prepareDbEnv();

const args = process.argv.slice(2);
const command = args[0];

if (command === "migration") {
  runSupabaseCli(args, dbPackageRoot);
} else if (command === "start") {
  runSupabaseCli(args);
} else if (command === "stop") {
  runSupabaseCli(args);
} else if (command === "status") {
  runSupabaseCli(args);
  showMailpitStatus();
} else {
  runSupabaseCli(args);
}
