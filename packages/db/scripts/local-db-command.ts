#!/usr/bin/env tsx

import { readFileSync } from "node:fs";

import { prepareDbEnv, runSupabaseCli, supabaseCliRoot } from "./_helpers";

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

function getConfiguredInbucketSmtpPort() {
  const configToml = readSupabaseConfigToml();
  const inbucketSection = configToml.match(/\[inbucket\]([\s\S]*?)(?:\n\[|$)/m)?.[1];
  const match = inbucketSection?.match(/^smtp_port\s*=\s*(\d+)/m);

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
    const output = require("node:child_process")
      .execFileSync("docker", ["ps", "-q", "-f", `name=^${name}$`], {
        stdio: "pipe",
        encoding: "utf8",
      })
      .trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

function showMailpitStatus() {
  const supabaseMailpitContainerName = getSupabaseMailpitContainerName();
  const supabaseMailpitRunning = isContainerRunning(supabaseMailpitContainerName);
  const configuredInbucketSmtpPort = getConfiguredInbucketSmtpPort();
  console.info(`Supabase Mailpit UI: ${supabaseMailpitRunning ? "running" : "stopped"}`);

  if (configuredInbucketSmtpPort) {
    console.info(
      `Mailpit SMTP: 127.0.0.1:${configuredInbucketSmtpPort} (direct from Supabase Inbucket)`,
    );
  } else {
    console.info("Mailpit SMTP: not exposed by Supabase config");
  }
  console.info("Mailpit UI: http://127.0.0.1:54324");
}

prepareDbEnv();

const args = process.argv.slice(2);
const command = args[0];

if (command === "start") {
  runSupabaseCli(args);
} else if (command === "stop") {
  runSupabaseCli(args);
} else if (command === "status") {
  runSupabaseCli(args);
  showMailpitStatus();
} else {
  runSupabaseCli(args);
}
