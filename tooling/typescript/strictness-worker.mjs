#!/usr/bin/env node

import { resolve } from "node:path";

import { analyzeStrictness } from "./strictness-ratchet.mjs";

const [rootArgument, project, flag] = process.argv.slice(2);
if (!rootArgument || !project || !flag) {
  throw new Error("strictness worker requires a root, project path, and flag");
}

const root = resolve(rootArgument);
process.stdout.write(
  JSON.stringify(analyzeStrictness(root, { projects: [project], flags: [flag] })),
);
