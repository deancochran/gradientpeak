#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { directCiSmokeReferences } from "../qa/profiles.mjs";
import { runRegisteredJourneys, selectRegisteredJourneys } from "./capability-runner.mjs";
import {
  discoverUserFacingSurfaces,
  evaluateCompletion,
  loadReferenceSources,
  validateParity,
} from "./parity.mjs";

const root = process.cwd();
const registry = await import(pathToFileURL(path.join(root, "packages/core/parity/index.ts")).href);
const currentRecords = registry.crossPlatformFeatureRegistry ?? registry.atomicCapabilityRegistry;
const validation = validateParity({
  directCiReferences: directCiSmokeReferences,
  discoveredSurfaces: await discoverUserFacingSurfaces(root),
  exceptions: registry.paritySurfaceExceptions,
  records: currentRecords,
  referenceSources: await loadReferenceSources(root, currentRecords),
  schema: registry.crossPlatformFeatureSchema,
});
const preflight = evaluateCompletion({ validation, records: currentRecords });
if (preflight.structuralIssues.length || preflight.implementationIssues.length) {
  process.stderr.write("Completion preflight failed; exact journeys were not run.\n");
  for (const issue of [...preflight.structuralIssues, ...preflight.implementationIssues])
    process.stderr.write(`- ${issue}\n`);
  process.exitCode = 1;
} else {
  const selection = selectRegisteredJourneys(currentRecords);
  const results = await runRegisteredJourneys(selection.journeys, { cwd: root });
  const outcome = evaluateCompletion({
    validation,
    records: currentRecords,
    journeyResults: [...selection.missing.map((gap) => ({ ...gap, status: "gap" })), ...results],
  });
  for (const issue of [...outcome.journeyIssues, ...outcome.proofIssues])
    process.stderr.write(`- ${issue}\n`);
  process.exitCode = outcome.ok ? 0 : 1;
}
