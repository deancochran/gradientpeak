#!/usr/bin/env tsx

import { prepareDbEnv, runPnpmExec } from "./_helpers";

prepareDbEnv();

const args = process.argv.slice(2);
const positionalName = args.find((arg) => !arg.startsWith("-"));
const hasNameArg = args.some((arg) => arg === "--name" || arg.startsWith("--name="));

const command = ["drizzle-kit", "generate", "--config", "drizzle.config.ts", "--prefix", "index"];

if (hasNameArg) {
  command.push(...args);
} else if (positionalName) {
  command.push("--name", positionalName, ...args.filter((arg) => arg !== positionalName));
} else {
  command.push(...args);
}

runPnpmExec(command);
