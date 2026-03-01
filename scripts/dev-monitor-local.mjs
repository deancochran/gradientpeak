#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const logsDir = path.join(repoRoot, ".logs");

const serviceConfigs = {
  mobile: {
    command: "pnpm",
    args: ["--filter", "mobile", "dev"],
    logFile: "mobile.log",
  },
  web: {
    command: "pnpm",
    args: ["--filter", "web", "dev:next"],
    logFile: "web.log",
  },
  supabase: {
    command: "pnpm",
    args: ["--filter", "@repo/supabase", "dev:supabase"],
    logFile: "supabase.log",
  },
  core: {
    command: "pnpm",
    args: ["--filter", "@repo/core", "watch"],
    logFile: "core.log",
  },
  trpc: {
    command: "pnpm",
    args: ["--filter", "@repo/trpc", "watch"],
    logFile: "trpc.log",
  },
};

function usage() {
  console.log(`Usage: node scripts/dev-monitor-local.mjs [options]

Options:
  --clean           Truncate existing log files before start
  --no-mobile       Disable mobile service
  --no-web          Disable web service
  --no-supabase     Disable supabase service
  --no-core         Disable core service
  --no-trpc         Disable trpc service
  --help            Show this help message`);
}

function parseArgs(argv) {
  const args = new Set(argv);
  if (args.has("--help")) {
    usage();
    process.exit(0);
  }

  const unknownArgs = [...args].filter((arg) => {
    return ![
      "--clean",
      "--no-mobile",
      "--no-web",
      "--no-supabase",
      "--no-core",
      "--no-trpc",
    ].includes(arg);
  });

  if (unknownArgs.length > 0) {
    console.error(`Unknown option(s): ${unknownArgs.join(", ")}`);
    usage();
    process.exit(1);
  }

  return {
    clean: args.has("--clean"),
    enabledServices: Object.keys(serviceConfigs).filter(
      (service) => !args.has(`--no-${service}`),
    ),
  };
}

function createLineForwarder(stream, onLine) {
  let buffer = "";
  stream.setEncoding("utf8");

  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      onLine(line);
    }
  });

  stream.on("end", () => {
    if (buffer.length > 0) {
      onLine(buffer);
    }
  });
}

function prefixed(service, line) {
  return `[${service}] ${line}`;
}

const { clean, enabledServices } = parseArgs(process.argv.slice(2));

fs.mkdirSync(logsDir, { recursive: true });

if (enabledServices.length === 0) {
  console.log("No services enabled. Exiting.");
  process.exit(0);
}

const children = new Map();
let shuttingDown = false;

for (const service of enabledServices) {
  const config = serviceConfigs[service];
  const logPath = path.join(logsDir, config.logFile);

  if (clean) {
    fs.writeFileSync(logPath, "");
  }

  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const child = spawn(config.command, config.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  children.set(service, { child, logStream });

  console.log(
    prefixed(
      "monitor",
      `started ${service}: ${config.command} ${config.args.join(" ")}`,
    ),
  );

  const writeStdoutLine = (line) => {
    const msg = prefixed(service, line);
    process.stdout.write(`${msg}\n`);
    logStream.write(`${msg}\n`);
  };

  const writeStderrLine = (line) => {
    const msg = prefixed(service, line);
    process.stderr.write(`${msg}\n`);
    logStream.write(`${msg}\n`);
  };

  if (child.stdout) {
    createLineForwarder(child.stdout, writeStdoutLine);
  }

  if (child.stderr) {
    createLineForwarder(child.stderr, writeStderrLine);
  }

  child.on("exit", (code, signal) => {
    console.log(
      prefixed("monitor", `${service} exited (code=${code}, signal=${signal})`),
    );
    logStream.end();
    children.delete(service);

    if (children.size === 0) {
      process.exit(0);
    }
  });

  child.on("error", (error) => {
    const msg = prefixed(
      "monitor",
      `${service} failed to start: ${error.message}`,
    );
    process.stderr.write(`${msg}\n`);
    logStream.write(`${msg}\n`);
    logStream.end();
    children.delete(service);
  });
}

function terminateChild(child) {
  if (process.platform === "win32") {
    child.kill("SIGTERM");
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function forceKillChild(child) {
  if (process.platform === "win32") {
    child.kill("SIGKILL");
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(prefixed("monitor", `received ${signal}, shutting down...`));

  const activeChildren = [...children.values()].map((entry) => entry.child);
  for (const child of activeChildren) {
    terminateChild(child);
  }

  setTimeout(() => {
    for (const child of activeChildren) {
      if (!child.killed) {
        forceKillChild(child);
      }
    }
  }, 5000).unref();

  if (activeChildren.length === 0) {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
