#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { directCiSmokeReferences } from "../qa/profiles.mjs";
import {
  classifyParity,
  discoverUserFacingSurfaces,
  formatParityReport,
  loadReferenceSources,
  parityExitCode,
  validateParity,
} from "./parity.mjs";

const root = process.cwd();
const strict = process.argv.slice(2).includes("--strict");
const proofStrict = process.argv.slice(2).includes("--proof-strict");
const registry = await import(pathToFileURL(path.join(root, "packages/core/parity/index.ts")).href);
const discoveredSurfaces = await discoverUserFacingSurfaces(root);
const referenceSources = await loadReferenceSources(root, registry.crossPlatformFeatureRegistry);
const validation = validateParity({
  directCiReferences: directCiSmokeReferences,
  discoveredSurfaces,
  exceptions: registry.paritySurfaceExceptions,
  records: registry.crossPlatformFeatureRegistry,
  referenceSources,
  schema: registry.crossPlatformFeatureSchema,
});
const classification = classifyParity(
  validation.records,
  validation.unclassified,
  validation.referenceIssues,
);
process.stdout.write(formatParityReport(classification));

const exitCode = parityExitCode({
  classification,
  issues: validation.issues,
  proofStrict,
  strict,
});
if (validation.issues.length > 0) {
  process.stderr.write(
    `Parity registry validation failed:\n${validation.issues.map((issue) => `- ${issue}`).join("\n")}\n`,
  );
} else if (strict && classification.implementationGaps.length > 0) {
  process.stderr.write("Strict parity failed: required capability implementation gaps remain.\n");
} else if (proofStrict && classification.proofGaps.length > 0) {
  process.stderr.write("Proof-strict parity failed: required runtime proof gaps remain.\n");
}
process.exitCode = exitCode;
