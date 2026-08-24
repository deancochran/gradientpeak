#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  bindInvocation,
  compileManifest,
  createInvocation,
  executeOwnedRun,
  findScenario,
  fixtureVariableRegistry,
  loadEnvFile,
  maestroRoot,
  makeReceipt,
  mergeEnvironment,
  policy,
  preflightDisposition,
  provisionWithService,
  readRunState,
  resetWithService,
  statePath,
  summarize,
  suitePolicies,
  validateEnvironment,
  validateLeaseId,
  validateSuiteEligibility,
  validateStatic,
  validateTarget,
  writeReceipt,
  writeState,
} from "./fixture-contracts/lib.mjs";

function parseArgs(args) {
  const result = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }
    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) result[rawName] = inlineValue;
    else if (args[index + 1] && !args[index + 1].startsWith("--")) {
      index += 1;
      result[rawName] = args[index];
    } else result[rawName] = true;
  }
  return result;
}

function usage() {
  return `GradientPeak mobile fixture contracts

Commands:
  validate                         Validate static contracts and 97x2 linkage
  manifest [--domain DOMAIN]       Print compiled machine-readable contracts
  inventory [--domain DOMAIN]      Print domain-owned variable names (never values)
  preflight --flow FLOW --run-id ID [--lease-id ID]  Require a matching provision state
  provision --flow FLOW [--run-id ID] [--env F]      Provision one unique run lease
  reset --flow FLOW --run-id ID [--lease-id ID]      Reset only the matching run lease
  run --flow FLOW [--run-id ID] [--suite SUITE]      Provision, run once, reset in finally
  summarize [--run-id ID] [--env F] [--json]         Summarize scoped runtime receipts

Mutation requires ${policy.service.enableVariable}=1 and ${policy.service.urlVariable}=http://127.0.0.1:<port>/.
 No command starts a database or fixture service. The run command starts Maestro only after a
  fresh READY receipt exists; all other commands are device-free. Generated run IDs are unique;
  explicit --run-id is only for CI retry correlation and is strictly validated.`;
}

function envPath(value) {
  if (!value) return resolve(maestroRoot, "fixtures.env");
  if (value.startsWith(".maestro/")) return resolve(maestroRoot, value.slice(".maestro/".length));
  return resolve(process.cwd(), value);
}

function loadValues(path) {
  const loaded = loadEnvFile(path);
  return { ...loaded, values: mergeEnvironment(loaded.values) };
}

function scenarioFromArgs(args, manifest) {
  const selector = args.flow || args.contract || args._[0];
  if (!selector) throw new Error("--flow or --contract is required");
  return findScenario(selector, manifest);
}

function invocationFromArgs(args) {
  const generated = createInvocation(args["run-id"]);
  return args["lease-id"]
    ? { runId: generated.runId, leaseId: validateLeaseId(args["lease-id"]) }
    : generated;
}

function printErrors(errors) {
  for (const error of errors) process.stderr.write(`- ${error}\n`);
}

function blockedReceipt(scenario, kind, detail) {
  const receipt = makeReceipt({
    scenario,
    kind,
    provisionStatus: "BLOCKED",
    provisionDetail: detail,
  });
  const path = writeReceipt(receipt);
  process.stderr.write(`BLOCKED ${scenario.id}\nReceipt: ${path}\n`);
}

function persistReadyProvision(scenario, result) {
  const receipt = makeReceipt({
    scenario,
    kind: "fixture-provision",
    provisionStatus: "READY",
    provisionDetail: "Local fixture service confirmed the exact scenario revision.",
    actorIds: result.actorIds,
    recordIds: result.recordIds,
    inventory: result.inventory,
  });
  const receiptPath = writeReceipt(receipt);
  const state = {
    status: "READY",
    contractId: scenario.id,
    revision: scenario.revision,
    fixtureInstance: scenario.fixtureInstance,
    runId: scenario.runId,
    leaseId: scenario.leaseId,
    contractFingerprint: scenario.contractFingerprint,
    actorIds: result.actorIds,
    recordIds: result.recordIds,
    inventory: result.inventory,
    ownershipRequirements: scenario.ownershipRequirements,
    ownershipToken: result.ownershipToken,
    provisionedAt: receipt.createdAt,
    provisionReceiptId: receipt.receiptId,
    provisionReceiptPath: receiptPath,
  };
  writeState(scenario, state);
  return { state, receiptPath };
}

async function resetOwnedProvision({ scenario, state, target }) {
  const result = await resetWithService({ state, target });
  writeState(scenario, { ...state, status: "CLEAN", ownershipToken: state.ownershipToken });
  const receipt = makeReceipt({
    scenario,
    kind: "fixture-reset",
    provisionStatus: "READY",
    provisionDetail: "The matching provision receipt owned cleanup.",
    cleanupStatus: "CLEAN",
    cleanupDetail:
      `Fixture service confirmed exact cleanup of ${result.affectedActorIds.length} owned actors ` +
      `and ${result.affectedRecordIds.length} owned records.`,
    actorIds: state.actorIds,
    recordIds: state.recordIds,
    inventory: state.inventory,
  });
  return { result, receiptPath: writeReceipt(receipt) };
}

function runMaestro(scenario, suiteName, envFile, state) {
  const suite = suitePolicies[suiteName];
  const mobileRoot = resolve(maestroRoot, "..");
  const script = resolve(mobileRoot, "scripts/maestro.mjs");
  const artifactPath = `.maestro/artifacts/test-output/${suiteName}/${scenario.runId}/${scenario.leaseId}`;
  const result = spawnSync(
    process.execPath,
    [
      script,
      "test",
      `.maestro/${scenario.flow}`,
    ],
    {
      cwd: mobileRoot,
      env: {
        ...process.env,
        MAESTRO_ENV_FILE: envFile,
        MAESTRO_INCLUDE_TAGS: suite.includeTags.join(","),
        MAESTRO_EXCLUDE_TAGS: suite.excludeTags.join(","),
        MAESTRO_TEST_OUTPUT_DIR: artifactPath,
      },
      stdio: "inherit",
    },
  );
  const status = result.error || result.status !== 0 ? "FAILED" : "PASSED";
  writeReceipt(
    makeReceipt({
      scenario,
      kind: "maestro-runtime",
      provisionStatus: "READY",
      provisionDetail: "A fresh matching READY receipt was verified before Maestro started.",
      runtimeStatus: status,
      maestroEvidencePath: artifactPath,
      actorIds: state.actorIds,
      recordIds: state.recordIds,
      inventory: state.inventory,
    }),
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Maestro exited with status ${result.status ?? "unknown"}`);
  return result.status;
}

async function main() {
  const command = process.argv[2] ?? "help";
  const args = parseArgs(process.argv.slice(3));
  const manifest = compileManifest();

  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (command === "validate") {
    const result = validateStatic(manifest);
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `VALID: ${result.counts.sourceIdentities} sources x 2 = ${result.counts.primaryVariations} primary contracts; ` +
        `${result.counts.lifecyclePolicies} lifecycle policies; ` +
        `${result.counts.expectedPass} expected-pass, ${result.counts.intentionalRed} intentional-red, ` +
        `${result.counts.baselineFlows} linked baselines, ${result.counts.extraDomainFlows} extra domain flows, ` +
        `${result.counts.unsupportedFlows} unsupported, 0 runtime receipts.\n`,
    );
    return;
  }

  if (command === "manifest") {
    const output = args.domain
      ? {
          ...manifest,
          domains: { [args.domain]: manifest.domains[args.domain] },
          scenarios: manifest.scenarios.filter((scenario) => scenario.domain === args.domain),
          primary: manifest.primary.filter((scenario) => scenario.domain === args.domain),
          baseline: manifest.baseline.filter((scenario) => scenario.domain === args.domain),
          extras: manifest.extras.filter((scenario) => scenario.domain === args.domain),
          unsupported: manifest.unsupported.filter((scenario) => scenario.domain === args.domain),
        }
      : manifest;
    if (args.domain && !manifest.domains[args.domain])
      throw new Error(`Unknown domain ${args.domain}`);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  if (command === "inventory") {
    const registry = fixtureVariableRegistry(manifest);
    const grouped = {};
    for (const variable of registry.variables) {
      const owners = variable.owners.length > 0 ? variable.owners : ["compatibility"];
      for (const owner of owners) {
        grouped[owner] ??= [];
        grouped[owner].push({
          name: variable.name,
          secret: variable.secret,
          compatibilityOnly: variable.compatibilityOnly,
        });
      }
    }
    const output = args.domain ? { [args.domain]: grouped[args.domain] ?? [] } : grouped;
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  if (command === "preflight") {
    const baseScenario = scenarioFromArgs(args, manifest);
    const invocation = invocationFromArgs(args);
    const state = readRunState(baseScenario, invocation.runId, args["lease-id"]);
    const scenario = bindInvocation(baseScenario, state ?? invocation);
    const loaded = loadValues(envPath(args.env));
    const disposition = preflightDisposition({ scenario, values: loaded.values, state, manifest });
    disposition.reasons.unshift(...loaded.errors);
    if (disposition.reasons.length > 0) disposition.status = "BLOCKED";
    const receipt = makeReceipt({
      scenario,
      kind: "preflight",
      provisionStatus: disposition.status,
      provisionDetail:
        disposition.status === "READY"
          ? "Required values and exact provision state are present."
          : disposition.reasons.join("; "),
      actorIds: state?.actorIds ?? [],
      recordIds: state?.recordIds ?? [],
      inventory: state?.inventory ?? { actors: [], records: [] },
    });
    const receiptPath = writeReceipt(receipt);
    process.stdout.write(
      `${disposition.status} ${disposition.classification} ${scenario.id}\nRun: ${scenario.runId}\nLease: ${scenario.leaseId}\nReceipt: ${receiptPath}\n`,
    );
    if (disposition.status !== "READY") {
      printErrors(disposition.reasons);
      process.exitCode = 2;
    }
    return;
  }

  if (command === "provision") {
    const scenario = bindInvocation(
      scenarioFromArgs(args, manifest),
      createInvocation(args["run-id"]),
    );
    const loaded = loadValues(envPath(args.env));
    const validation = validateEnvironment(scenario, loaded.values, manifest);
    const errors = [...loaded.errors, ...validation.errors];
    if (scenario.status === "manual" && !args["allow-manual"]) {
      errors.push("Manual baseline provisioning requires --allow-manual");
    }
    if (errors.length > 0) {
      blockedReceipt(scenario, "fixture-provision", errors.join("; "));
      printErrors(errors);
      process.exitCode = 2;
      return;
    }
    let target;
    try {
      target = validateTarget(
        process.env[policy.service.urlVariable],
        process.env[policy.service.enableVariable],
      );
    } catch (error) {
      blockedReceipt(scenario, "fixture-provision", error.message);
      throw error;
    }
    try {
      const result = await provisionWithService({ scenario, target });
      const { receiptPath } = persistReadyProvision(scenario, result);
      process.stdout.write(
        `READY ${scenario.id}\nRun: ${scenario.runId}\nLease: ${scenario.leaseId}\nState: ${statePath(scenario)}\nReceipt: ${receiptPath}\n`,
      );
    } catch (error) {
      blockedReceipt(scenario, "fixture-provision", error.message);
      throw error;
    }
    return;
  }

  if (command === "reset") {
    const baseScenario = scenarioFromArgs(args, manifest);
    const invocation = invocationFromArgs(args);
    const state = readRunState(baseScenario, invocation.runId, args["lease-id"]);
    const scenario = bindInvocation(baseScenario, state ?? invocation);
    if (!state) {
      blockedReceipt(
        scenario,
        "fixture-reset",
        "No owned provision state exists; refusing broad cleanup.",
      );
      process.exitCode = 2;
      return;
    }
    let target;
    try {
      target = validateTarget(
        process.env[policy.service.urlVariable],
        process.env[policy.service.enableVariable],
      );
      const { receiptPath } = await resetOwnedProvision({ scenario, state, target });
      process.stdout.write(
        `CLEAN ${scenario.id}\nRun: ${scenario.runId}\nLease: ${scenario.leaseId}\nReceipt: ${receiptPath}\n`,
      );
    } catch (error) {
      const receipt = makeReceipt({
        scenario,
        kind: "fixture-reset",
        provisionStatus: state.status === "READY" ? "READY" : "FAILED",
        provisionDetail: "A provision state exists.",
        cleanupStatus: "FAILED",
        cleanupDetail: error.message,
        actorIds: state.actorIds ?? [],
        recordIds: state.recordIds ?? [],
        inventory: state.inventory ?? { actors: [], records: [] },
      });
      const receiptPath = writeReceipt(receipt);
      process.stderr.write(`FAILED ${scenario.id}\nReceipt: ${receiptPath}\n`);
      throw error;
    }
    return;
  }

  if (command === "run") {
    const scenario = bindInvocation(
      scenarioFromArgs(args, manifest),
      createInvocation(args["run-id"]),
    );
    const suiteName = args.suite || scenario.executionClass;
    const eligibility = validateSuiteEligibility(scenario, suiteName);
    const loadedPath = envPath(args.env);
    const loaded = loadValues(loadedPath);
    const validation = validateEnvironment(scenario, loaded.values, manifest);
    const errors = [...eligibility.reasons, ...loaded.errors, ...validation.errors];
    if (scenario.status === "manual" && !args["allow-manual"]) {
      errors.push("Manual lifecycle execution requires --allow-manual");
    }
    if (errors.length > 0) {
      blockedReceipt(scenario, "lifecycle-run", errors.join("; "));
      printErrors(errors);
      process.exitCode = 2;
      return;
    }
    let target;
    try {
      target = validateTarget(
        process.env[policy.service.urlVariable],
        process.env[policy.service.enableVariable],
      );
    } catch (error) {
      blockedReceipt(scenario, "lifecycle-run", error.message);
      process.stderr.write(`- ${error.message}\n`);
      process.exitCode = 2;
      return;
    }

    await executeOwnedRun({
      provision: async () => {
        const result = await provisionWithService({ scenario, target });
        // Return ownership immediately. If durable receipt writing fails next, finally can
        // still reset this exact service-owned fixture instead of leaking it.
        return {
          status: "READY",
          contractId: scenario.id,
          revision: scenario.revision,
           fixtureInstance: scenario.fixtureInstance,
           runId: scenario.runId,
           leaseId: scenario.leaseId,
          contractFingerprint: scenario.contractFingerprint,
           actorIds: result.actorIds,
           recordIds: result.recordIds,
           inventory: result.inventory,
           ownershipRequirements: scenario.ownershipRequirements,
          ownershipToken: result.ownershipToken,
        };
      },
      verifyReceipt: async (state) => {
        const owned = persistReadyProvision(scenario, state);
        Object.assign(state, owned.state);
        process.stdout.write(
          `READY ${scenario.id}\nRun: ${scenario.runId}\nLease: ${scenario.leaseId}\nReceipt: ${owned.receiptPath}\n`,
        );
        const disposition = preflightDisposition({
          scenario,
          values: loaded.values,
          state,
          manifest,
        });
        if (disposition.status !== "READY") {
          throw new Error(`Fresh receipt verification failed: ${disposition.reasons.join("; ")}`);
        }
      },
      runMaestro: async (state) => runMaestro(scenario, suiteName, loadedPath, state),
      reset: async (state) => {
        try {
          const result = await resetOwnedProvision({ scenario, state, target });
          process.stdout.write(`CLEAN ${scenario.id}\nReceipt: ${result.receiptPath}\n`);
        } catch (error) {
          const receiptPath = writeReceipt(
            makeReceipt({
              scenario,
              kind: "fixture-reset",
              provisionStatus: "READY",
              provisionDetail: "The matching lifecycle-run ownership was available.",
              cleanupStatus: "FAILED",
              cleanupDetail: error.message,
              actorIds: state.actorIds ?? [],
              recordIds: state.recordIds ?? [],
              inventory: state.inventory ?? { actors: [], records: [] },
            }),
          );
          process.stderr.write(`FAILED RESET ${scenario.id}\nReceipt: ${receiptPath}\n`);
          throw error;
        }
      },
    });
    return;
  }

  if (command === "summarize") {
    const invocation = createInvocation(args["run-id"]);
    const path = envPath(args.env);
    const loaded = existsSync(path) ? loadValues(path) : { values: new Map(), errors: [] };
    const result = summarize({ manifest, values: loaded.values, runId: invocation.runId });
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(
        `Run ${result.runId}: fixtures ${result.ready} READY, ${result.blocked} BLOCKED; classifications: ` +
          `${result.expectedPass} EXPECTED_PASS, ${result.intentionalRed} INTENTIONAL_RED, ` +
          `runtime ${result.runtimePassed} PASSED, ${result.runtimeFailed} FAILED, ` +
          `${result.runtimeUnknown} UNKNOWN (${result.runtimeNotRun} NOT_RUN).\n${result.note}\n`,
      );
    }
    return;
  }

  throw new Error(`Unknown command ${command}\n\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = process.exitCode || 1;
});
