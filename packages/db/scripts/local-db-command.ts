#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";

import { prepareDbEnv, runSupabaseCli } from "./_helpers";

const mailpitSmtpProxyContainerName = "gradientpeak-mailpit-smtp-proxy";
const mailpitSmtpProxyImage = "alpine/socat:latest";
const supabaseMailpitContainerName = "supabase_inbucket_supabase";

function runDocker(args: string[], quiet = false) {
  return execFileSync("docker", args, {
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
  });
}

function hasContainer(name: string) {
  try {
    const output = runDocker(["ps", "-aq", "-f", `name=^${name}$`], true).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

function isContainerRunning(name: string) {
  try {
    const output = runDocker(["ps", "-q", "-f", `name=^${name}$`], true).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

function getSupabaseMailpitNetwork() {
  const output = runDocker(
    [
      "inspect",
      "--format",
      "{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}",
      supabaseMailpitContainerName,
    ],
    true,
  ).trim();

  if (!output) {
    throw new Error("Supabase Mailpit container is not available");
  }

  return output;
}

function startMailpitSmtpProxy() {
  if (isContainerRunning(mailpitSmtpProxyContainerName)) {
    console.info("Mailpit SMTP proxy is already running.");
    return;
  }

  const networkName = getSupabaseMailpitNetwork();

  if (hasContainer(mailpitSmtpProxyContainerName)) {
    console.info("Starting Mailpit SMTP proxy...");
    runDocker(["start", mailpitSmtpProxyContainerName]);
    return;
  }

  console.info("Creating Mailpit SMTP proxy...");
  runDocker([
    "run",
    "-d",
    "--name",
    mailpitSmtpProxyContainerName,
    "--network",
    networkName,
    "-p",
    "54325:54325",
    mailpitSmtpProxyImage,
    "TCP-LISTEN:54325,fork,reuseaddr",
    `TCP:${supabaseMailpitContainerName}:1025`,
  ]);
}

function stopMailpitSmtpProxy() {
  if (!hasContainer(mailpitSmtpProxyContainerName)) {
    return;
  }

  if (!isContainerRunning(mailpitSmtpProxyContainerName)) {
    return;
  }

  console.info("Stopping Mailpit SMTP proxy...");
  runDocker(["stop", mailpitSmtpProxyContainerName]);
}

function showMailpitStatus() {
  const supabaseMailpitRunning = isContainerRunning(supabaseMailpitContainerName);
  console.info(`Supabase Mailpit UI: ${supabaseMailpitRunning ? "running" : "stopped"}`);

  if (!hasContainer(mailpitSmtpProxyContainerName)) {
    console.info("Mailpit SMTP proxy: not created");
    return;
  }

  console.info(
    `Mailpit SMTP proxy: ${isContainerRunning(mailpitSmtpProxyContainerName) ? "running" : "stopped"}`,
  );
  console.info("Mailpit UI: http://127.0.0.1:54324");
  console.info("Mailpit SMTP: 127.0.0.1:54325");
}

prepareDbEnv();

const args = process.argv.slice(2);
const command = args[0];

if (command === "start") {
  runSupabaseCli(args);
  startMailpitSmtpProxy();
} else if (command === "stop") {
  stopMailpitSmtpProxy();
  runSupabaseCli(args);
} else if (command === "status") {
  runSupabaseCli(args);
  showMailpitStatus();
} else {
  runSupabaseCli(args);
}
