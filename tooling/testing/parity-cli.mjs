#!/usr/bin/env node
import {
  classifyParity,
  discoverUserFacingSurfaces,
  formatParityReport,
  loadReferenceSources,
  validateParity,
} from "./parity.mjs";
import { buildParityRegistry, paritySurfaceExceptions } from "./parity-registry.mjs";

const root = process.cwd();
const records = await buildParityRegistry(root);
const result = validateParity({
  discoveredSurfaces: await discoverUserFacingSurfaces(root),
  exceptions: paritySurfaceExceptions,
  records,
  referenceSources: await loadReferenceSources(root, records),
});
const classification = classifyParity(records, result.referenceIssues);
process.stdout.write(formatParityReport(classification));
if (result.issues.length) {
  process.stderr.write(`${result.issues.map((issue) => `Parity failure: ${issue}`).join("\n")}\n`);
  process.exitCode = 1;
}
if (process.argv.includes("--proof-strict") && classification.runtimeProofGaps.length) {
  process.stderr.write("Parity proof-strict failure: required runtime proof is missing.\n");
  process.exitCode = 1;
}
