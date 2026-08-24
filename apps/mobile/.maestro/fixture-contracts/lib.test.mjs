import assert from "node:assert/strict";
import test from "node:test";
import {
  bindInvocation,
  compileManifest,
  createInvocation,
  executeOwnedRun,
  fixtureVariableRegistry,
  lifecycleRunPlan,
  makeReceipt,
  maestroRoot,
  preflightDisposition,
  provisionStateDisposition,
  provisionWithService,
  resetWithService,
  runtimeReceiptDisposition,
  statePath,
  summarize,
  validateEnvironment,
  validateNestedFlowArguments,
  validateRunId,
  validateStatic,
  validateSuiteEligibility,
  validateTarget,
} from "./lib.mjs";

const manifest = compileManifest();

function boundScenario(base = manifest.primary.find((entry) => entry.ownershipRequirements.mutates)) {
  return bindInvocation(base, createInvocation());
}

function inventoryFor(scenario, prefix = "owned") {
  let actorIndex = 0;
  let recordIndex = 0;
  return {
    actors: scenario.ownershipRequirements.actors.flatMap(({ category, count }) =>
      Array.from({ length: count }, () => ({ category, id: `${prefix}-actor-${actorIndex++}` })),
    ),
    records: scenario.ownershipRequirements.records.flatMap(({ category, count }) =>
      Array.from({ length: count }, () => ({ category, id: `${prefix}-record-${recordIndex++}` })),
    ),
  };
}

function responseAt(url, body, { status = 200, redirected = false } = {}) {
  const response = new Response(JSON.stringify(body), { status });
  Object.defineProperty(response, "url", { value: String(url) });
  Object.defineProperty(response, "redirected", { value: redirected });
  return response;
}

function receiptOptions(scenario, overrides = {}) {
  const inventory = inventoryFor(scenario, "receipt");
  return {
    scenario,
    kind: "maestro-runtime",
    provisionStatus: "READY",
    provisionDetail: "Exact fixture ready.",
    runtimeStatus: "PASSED",
    maestroEvidencePath: `.maestro/artifacts/test-output/test/${scenario.runId}/${scenario.leaseId}`,
    inventory,
    actorIds: inventory.actors.map((entry) => entry.id),
    recordIds: inventory.records.map((entry) => entry.id),
    sourceIdentity: { commit: "abc", base: "base", branch: "dev", dirty: false },
    ...overrides,
  };
}

function validValue(name) {
  if (/_EMAIL(?:_[AB])?$/.test(name)) return `${name.toLowerCase()}@example.test`;
  if (/_PASS(?:_[AB])?$/.test(name) || /PASSWORD$/.test(name)) return "not-a-real-secret";
  if (/_DATE(?:_[AB])?$/.test(name) || /_ANCHOR_DATE$|_SELECTED_DATE$/.test(name))
    return "2026-09-17";
  if (/_ID(?:_[AB])?$/.test(name) && name !== "LOCAL_PROVIDER_ID") {
    return "123e4567-e89b-42d3-a456-426614174000";
  }
  if (/_FILE_DISPLAY_NAME(?:_[AB])?$/.test(name)) return "fixture.gpx";
  return `fixture-${name.toLowerCase()}`;
}

function valuesFor(scenario) {
  return new Map(scenario.requiredVariables.map((name) => [name, validValue(name)]));
}

test("compiles explicit 97x2 domain contracts and linked baselines", () => {
  assert.equal(manifest.primary.length, 194);
  assert.equal(manifest.baseline.length, 97);
  assert.ok(manifest.extras.length > 0);
  assert.equal(manifest.unsupported.length, 1);
  assert.equal(new Set(manifest.primary.map((entry) => entry.sourceIdentity)).size, 97);
  assert.equal(new Set(manifest.primary.map((entry) => entry.id)).size, 194);
  assert.equal(manifest.primary.filter((entry) => entry.status === "supported").length, 172);
  assert.equal(manifest.primary.filter((entry) => entry.status === "intentional-red").length, 22);

  for (const scenario of manifest.scenarios) {
    assert.ok(scenario.id);
    assert.ok(scenario.revision);
    assert.ok(scenario.fixtureInstanceBase);
    assert.match(scenario.fixtureInstance, /@<run-id>@<lease-id>$/);
    assert.ok(Array.isArray(scenario.actors));
    assert.ok(Array.isArray(scenario.requiredVariables));
    assert.ok(Array.isArray(scenario.secretVariables));
    assert.ok(Array.isArray(scenario.ownedRecords));
    assert.ok(scenario.ownershipRequirements);
    assert.ok(Array.isArray(scenario.preconditions));
    assert.ok(scenario.mutationScope);
    assert.ok(scenario.reset);
    assert.ok(scenario.lifecycle.policy);
    assert.ok(scenario.lifecycle.postcondition);
    assert.match(scenario.contractFingerprint, /^[0-9a-f]{64}$/);
    assert.ok(scenario.executionClass);
    assert.ok(Array.isArray(scenario.pickerPrerequisites));
    assert.equal(typeof scenario.classification.intentionalRed, "boolean");
  }
});

test("static validation covers every variable and destructive reset contract", () => {
  const result = validateStatic(manifest);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.counts, {
    domains: 15,
    sourceIdentities: 97,
    primaryVariations: 194,
    lifecyclePolicies: 194,
    baselineFlows: 97,
    extraDomainFlows: manifest.extras.length,
    unsupportedFlows: 1,
    expectedPass: 172,
    intentionalRed: 22,
    runtimeReceipts: 0,
  });
  for (const scenario of manifest.primary.filter((entry) => entry.mutationScope.destructive)) {
    assert.equal(scenario.reset.required, true, scenario.id);
    assert.equal(scenario.reset.ownershipSelector.contractId, scenario.id);
  }
});

test("static validation rejects a primary YAML source identity that disagrees with coverage", () => {
  const original = manifest.primary[0];
  const changed = { ...original, headerSourceIdentity: "wrong/source.yaml" };
  const altered = {
    ...manifest,
    primary: manifest.primary.map((entry) => (entry === original ? changed : entry)),
    scenarios: manifest.scenarios.map((entry) => (entry === original ? changed : entry)),
  };
  const result = validateStatic(altered);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("does not match coverage mapping")));
});

test("nested argument validation applies to non-domain reusable flows", () => {
  const result = validateNestedFlowArguments({
    flowTexts: new Map([
      [
        "flows/main/plan_screen.yaml",
        `appId: test\n---\n- runFlow:\n    file: ../reusable/login.yaml\n    env:\n      email: actor@example.test\n      password: secret`,
      ],
      [
        "flows/reusable/login.yaml",
        `appId: test\n---\n- inputText: "\${email}"\n- inputText: "\${password}"`,
      ],
    ]),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("email must have an explicit # @arg")));
  assert.ok(result.errors.some((error) => error.includes("passes undeclared runFlow.env")));
});

test("domain inventory classifies secrets without exposing their example values", () => {
  const registry = fixtureVariableRegistry(manifest);
  const password = registry.variables.find((entry) => entry.name === "STANDARD_USER_PASS");
  assert.deepEqual(password?.defaultValue, null);
  assert.equal(password?.secret, true);
  assert.ok(password?.owners.length);
});

test("environment validation rejects blanks, unknowns, dates, UUIDs, paths, and A/B collisions", () => {
  const scenario = manifest.primary.find((entry) =>
    entry.requiredVariables.includes("AGENDA_DATE"),
  );
  assert.ok(scenario);
  const values = valuesFor(scenario);
  values.set("AGENDA_DATE", "2026-02-30");
  values.set("AGENDA_PLANNED_EVENT_ID", "not-a-uuid");
  values.set("DELETE_ACTIVITY_ID_A", "123e4567-e89b-42d3-a456-426614174000");
  values.set("DELETE_ACTIVITY_ID_B", "123e4567-e89b-42d3-a456-426614174000");
  values.set("ROUTE_FILE_DISPLAY_NAME_HOST_PATH", "/definitely/missing/fixture.gpx");
  values.set("UNKNOWN_FIXTURE_VALUE", "nope");
  const result = validateEnvironment(scenario, values, manifest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("AGENDA_DATE must be a real")));
  assert.ok(
    result.errors.some((error) =>
      error.includes("AGENDA_PLANNED_EVENT_ID must be an RFC 4122 UUID"),
    ),
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes("DELETE_ACTIVITY_ID_A and DELETE_ACTIVITY_ID_B collide"),
    ),
  );
  assert.ok(result.errors.some((error) => error.includes("must name an existing file")));
  assert.ok(
    result.errors.some((error) =>
      error.includes("Unrecognized fixture variable UNKNOWN_FIXTURE_VALUE"),
    ),
  );

  values.set("AGENDA_DATE", "");
  const blank = validateEnvironment(scenario, values, manifest);
  assert.ok(blank.errors.some((error) => error.includes("AGENDA_DATE is blank or missing")));
});

test("target safety permits only explicitly enabled loopback HTTP origins", () => {
  assert.equal(validateTarget("http://127.0.0.1:43123/", "1").origin, "http://127.0.0.1:43123");
  assert.equal(validateTarget("http://[::1]:43123/", "1").hostname, "[::1]");
  assert.throws(() => validateTarget("http://127.0.0.1:43123/", "0"), /required/);
  assert.throws(() => validateTarget("https://127.0.0.1:43123/", "1"), /local HTTP/);
  assert.throws(() => validateTarget("http://api.example.com/", "1"), /not loopback/);
  assert.throws(() => validateTarget("http://localhost:43123/", "1"), /not loopback/);
  assert.throws(() => validateTarget("http://127.0.0.1:43123/path", "1"), /without a path/);
  assert.throws(() => validateTarget("http://127.0.0.1:43123/?query=1", "1"), /query/);
  const credentialed = new URL("http://127.0.0.1:43123/");
  credentialed.username = "fixture-user";
  credentialed.password = "placeholder";
  assert.throws(() => validateTarget(credentialed.href, "1"), /must not contain credentials/);
});

test("provision protocol sends contract metadata but no fixture credentials", async () => {
  const scenario = boundScenario();
  const inventory = inventoryFor(scenario);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/v2/health")) {
      return responseAt(url, {
        protocol: "gradientpeak-maestro-fixtures/v2",
        environment: "local",
      });
    }
    return responseAt(url, {
      status: "READY",
      contractId: scenario.id,
      revision: scenario.revision,
      runId: scenario.runId,
      leaseId: scenario.leaseId,
      fixtureInstance: scenario.fixtureInstance,
      inventory,
      ownershipToken: "ownership:one",
    });
  };
  const result = await provisionWithService({
    scenario,
    target: new URL("http://127.0.0.1:43123/"),
    fetchImpl,
  });
  assert.deepEqual(result.inventory, inventory);
  const request = JSON.parse(calls[1].options.body);
  assert.equal(request.contractId, scenario.id);
  assert.equal(request.runId, scenario.runId);
  assert.equal(request.leaseId, scenario.leaseId);
  assert.deepEqual(request.ownershipRequirements, scenario.ownershipRequirements);
  assert.equal(calls.every((call) => call.options.redirect === "error"), true);
  assert.equal(JSON.stringify(request).includes("PASS"), false);
  assert.equal(JSON.stringify(request).includes("EMAIL"), false);
});

test("reset protocol rejects cleanup outside the exact provision ownership set", async () => {
  const scenario = boundScenario();
  const inventory = inventoryFor(scenario);
  const state = {
    contractId: scenario.id,
    revision: scenario.revision,
    runId: scenario.runId,
    leaseId: scenario.leaseId,
    fixtureInstance: scenario.fixtureInstance,
    ownershipToken: "owner:1",
    inventory,
    ownershipRequirements: scenario.ownershipRequirements,
  };
  const changed = structuredClone(inventory);
  changed.records[0].id = "record-not-owned";
  const fetchImpl = async (url) =>
    responseAt(url, {
      status: "CLEAN",
      contractId: state.contractId,
      revision: state.revision,
      runId: state.runId,
      leaseId: state.leaseId,
      fixtureInstance: state.fixtureInstance,
      ownershipToken: state.ownershipToken,
      affectedInventory: changed,
    });
  await assert.rejects(
    resetWithService({ state, target: new URL("http://127.0.0.1:43123/"), fetchImpl }),
    /differs from the exact provisioned ownership set/,
  );
  const wrongOwner = async (url) =>
    responseAt(url, {
      status: "CLEAN",
      contractId: state.contractId,
      revision: state.revision,
      runId: state.runId,
      leaseId: state.leaseId,
      fixtureInstance: state.fixtureInstance,
      ownershipToken: "different-owner",
      affectedInventory: inventory,
    });
  await assert.rejects(
    resetWithService({ state, target: new URL("http://127.0.0.1:43123/"), fetchImpl: wrongOwner }),
    /did not confirm exact cleanup/,
  );
});

test("generated invocations separate concurrent leases and the service conflict fails closed", async () => {
  const runId = "ci-retry-20260823";
  const first = bindInvocation(manifest.primary.find((entry) => entry.ownershipRequirements.mutates), createInvocation(runId));
  const second = bindInvocation(
    manifest.primary.find((entry) => entry.id === first.id),
    createInvocation(runId),
  );
  assert.equal(first.runId, second.runId);
  assert.notEqual(first.leaseId, second.leaseId);
  assert.notEqual(first.fixtureInstance, second.fixtureInstance);
  assert.notEqual(statePath(first), statePath(second));

  const fetchImpl = async (url) => {
    if (String(url).endsWith("/v2/health")) {
      return responseAt(url, { protocol: "gradientpeak-maestro-fixtures/v2", environment: "local" });
    }
    return responseAt(url, { error: "active lease" }, { status: 409 });
  };
  await assert.rejects(
    provisionWithService({
      scenario: second,
      target: new URL("http://127.0.0.1:43123/"),
      fetchImpl,
    }),
    /conflicting active run lease/,
  );
});

test("run IDs are strict and generated defaults are unique", () => {
  assert.equal(validateRunId("ci-retry-20260823"), "ci-retry-20260823");
  assert.throws(() => validateRunId("short"), /8-64/);
  assert.throws(() => validateRunId("CI-RETRY-20260823"), /lowercase/);
  assert.throws(() => validateRunId("../escape-run"), /lowercase/);
  assert.notEqual(createInvocation().runId, createInvocation().runId);
});

test("mutating provision requires complete categorized unique ownership", async () => {
  const scenario = boundScenario();
  const complete = inventoryFor(scenario);
  const attempt = async (inventory) => {
    const fetchImpl = async (url) => {
      if (String(url).endsWith("/v2/health")) {
        return responseAt(url, {
          protocol: "gradientpeak-maestro-fixtures/v2",
          environment: "local",
        });
      }
      return responseAt(url, {
        status: "READY",
        contractId: scenario.id,
        revision: scenario.revision,
        runId: scenario.runId,
        leaseId: scenario.leaseId,
        fixtureInstance: scenario.fixtureInstance,
        inventory,
        ownershipToken: "owner:complete",
      });
    };
    return provisionWithService({
      scenario,
      target: new URL("http://127.0.0.1:43123/"),
      fetchImpl,
    });
  };
  await assert.rejects(
    attempt({ actors: [], records: complete.records }),
    /actor inventory is incomplete/,
  );
  const duplicate = structuredClone(complete);
  duplicate.records[0].id = duplicate.actors[0].id;
  await assert.rejects(attempt(duplicate), /inventory IDs must be unique/);
});

test("redirects and unverifiable or foreign final origins are rejected", async () => {
  const scenario = boundScenario();
  let observedRedirectPolicy;
  const redirected = async (url, options) => {
    observedRedirectPolicy = options.redirect;
    return responseAt("http://127.0.0.2:43123/v2/health", {}, { redirected: true });
  };
  await assert.rejects(
    provisionWithService({
      scenario,
      target: new URL("http://127.0.0.1:43123/"),
      fetchImpl: redirected,
    }),
    /escaped the validated loopback endpoint/,
  );
  assert.equal(observedRedirectPolicy, "error");

  await assert.rejects(
    provisionWithService({
      scenario,
      target: new URL("http://127.0.0.1:43123/"),
      fetchImpl: async () => new Response("{}"),
    }),
    /verifiable final URL/,
  );
});

test("an absent fixture service remains unavailable before any runtime can start", async () => {
  await assert.rejects(
    provisionWithService({
      scenario: boundScenario(),
      target: new URL("http://127.0.0.1:43123/"),
      fetchImpl: async () => {
        throw new Error("connection refused");
      },
    }),
    /fixture service is unavailable/i,
  );
});

test("receipt separates fixture readiness from runtime proof and excludes credentials", () => {
  const scenario = boundScenario(
    manifest.primary.find((entry) => entry.secretVariables.length > 0),
  );
  assert.ok(scenario);
  const receipt = makeReceipt({
    scenario,
    kind: "fixture-provision",
    provisionStatus: "READY",
    provisionDetail: "Exact local fixture is ready.",
    ...(() => {
      const inventory = inventoryFor(scenario, "receipt-ready");
      return {
        inventory,
        actorIds: inventory.actors.map((entry) => entry.id),
        recordIds: inventory.records.map((entry) => entry.id),
      };
    })(),
    environment: {
      STANDARD_USER_PASS: "must-never-appear",
      MAESTRO_APP_ID: "com.example.local",
      MAESTRO_APP_SCHEME: "example-local",
    },
    sourceIdentity: { commit: "abc123", base: "base123", branch: "dev", dirty: true },
    now: new Date("2026-08-23T12:00:00.000Z"),
  });
  assert.equal(receipt.evidence.isRuntimeProof, false);
  assert.equal(receipt.runtime.status, "NOT_RUN");
  assert.equal(receipt.invocation.runId, scenario.runId);
  assert.equal(receipt.source.commit, "abc123");
  assert.equal(JSON.stringify(receipt).includes("must-never-appear"), false);
});

test("runtime receipts are accepted only for the exact run, lease, revision, and fingerprint", () => {
  const runId = "ci-runtime-20260823";
  const scenario = bindInvocation(manifest.primary[0], createInvocation(runId));
  const valid = makeReceipt(receiptOptions(scenario));
  assert.equal(
    runtimeReceiptDisposition({
      scenario: manifest.primary[0],
      runId,
      receiptEntries: [{ path: "valid.json", receipt: valid }],
    }).status,
    "PASSED",
  );

  const stale = structuredClone(valid);
  stale.fixture.revision = "stale-revision";
  assert.equal(
    runtimeReceiptDisposition({
      scenario: manifest.primary[0],
      runId,
      receiptEntries: [{ path: "stale.json", receipt: stale }],
    }).status,
    "UNKNOWN",
  );

  const wrongRun = structuredClone(valid);
  wrongRun.invocation.runId = "ci-runtime-other";
  assert.equal(
    runtimeReceiptDisposition({
      scenario: manifest.primary[0],
      runId,
      receiptEntries: [{ path: "wrong-run.json", receipt: wrongRun }],
    }).status,
    "UNKNOWN",
  );
});

test("runtime summaries report UNKNOWN and NOT_RUN without validated receipts", () => {
  const empty = summarize({
    manifest,
    values: new Map(),
    includeState: false,
    runId: "ci-summary-empty",
    receiptEntries: [],
  });
  assert.equal(empty.runtimeStatus, "UNKNOWN");
  assert.equal(empty.runtimePassed, 0);
  assert.equal(empty.runtimeFailed, 0);
  assert.equal(empty.runtimeNotRun, 194);
  assert.match(empty.note, /UNKNOWN \/ NOT_RUN/);

  const scenario = bindInvocation(manifest.primary[0], createInvocation("ci-summary-proof"));
  const receipt = makeReceipt(receiptOptions(scenario));
  const proved = summarize({
    manifest,
    values: new Map(),
    includeState: false,
    runId: scenario.runId,
    receiptEntries: [{ path: "runtime.json", receipt }],
  });
  assert.equal(proved.runtimePassed, 1);
  assert.equal(proved.runtimeFailed, 0);
  assert.equal(proved.runtimeNotRun, 193);
  assert.equal(proved.runtimeStatus, "UNKNOWN");
});

test("missing provision state is BLOCKED and intentional-red stays a separate classification", () => {
  const scenario = boundScenario(
    manifest.primary.find((entry) => entry.status === "intentional-red"),
  );
  assert.ok(scenario);
  const result = preflightDisposition({
    scenario,
    values: valuesFor(scenario),
    state: null,
    manifest,
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.classification, "INTENTIONAL_RED");
  assert.ok(result.reasons.some((reason) => reason.includes("No provision receipt")));
});

test("stale or incomplete provision receipts fail closed", () => {
  const scenario = boundScenario(manifest.primary[0]);
  const stale = provisionStateDisposition({
    scenario,
    state: {
      status: "READY",
      contractId: scenario.id,
      revision: scenario.revision,
      runId: scenario.runId,
      leaseId: scenario.leaseId,
      fixtureInstance: scenario.fixtureInstance,
      contractFingerprint: scenario.contractFingerprint,
      provisionedAt: "2026-08-23T10:00:00.000Z",
      provisionReceiptId: "receipt-old",
      provisionReceiptPath: `${maestroRoot}/artifacts/fixture-contracts/receipts/missing.json`,
    },
    now: new Date("2026-08-23T10:30:00.000Z"),
  });
  assert.equal(stale.status, "BLOCKED");
  assert.ok(stale.reasons.some((reason) => reason.includes("stale")));
  assert.ok(stale.reasons.some((reason) => reason.includes("missing")));

  const changed = provisionStateDisposition({
    scenario,
    state: {
      status: "READY",
      contractId: scenario.id,
      revision: scenario.revision,
      fixtureInstance: scenario.fixtureInstance,
      contractFingerprint: "0".repeat(64),
      provisionedAt: new Date().toISOString(),
    },
  });
  assert.ok(changed.reasons.some((reason) => reason.includes("nested lifecycle")));
});

test("lifecycle runner plans one eligible suite and reset in a guaranteed finally path", async () => {
  const scenario = manifest.primary.find(
    (entry) => entry.executionClass === "primary-expected-pass",
  );
  assert.ok(scenario);
  assert.equal(validateSuiteEligibility(scenario, "primary-expected-pass").ok, true);
  assert.equal(validateSuiteEligibility(scenario, "intentional-red").ok, false);
  assert.deepEqual(lifecycleRunPlan(scenario).steps, [
    "provision-owned-fixture",
    "verify-fresh-ready-receipt",
    "start-maestro-for-one-flow",
    "reset-owned-fixture-in-finally",
  ]);

  const events = [];
  await assert.rejects(
    executeOwnedRun({
      provision: async () => {
        events.push("provision");
        return { ownershipToken: "owned" };
      },
      verifyReceipt: async () => events.push("verify"),
      runMaestro: async () => {
        events.push("maestro");
        throw new Error("runtime failed");
      },
      reset: async () => events.push("reset"),
    }),
    /runtime failed/,
  );
  assert.deepEqual(events, ["provision", "verify", "maestro", "reset"]);
});

test("provision failure never starts Maestro and has no unowned broad reset", async () => {
  const events = [];
  await assert.rejects(
    executeOwnedRun({
      provision: async () => {
        events.push("provision");
        throw new Error("fixture service unavailable");
      },
      verifyReceipt: async () => events.push("verify"),
      runMaestro: async () => events.push("maestro"),
      reset: async () => events.push("reset"),
    }),
    /fixture service unavailable/,
  );
  assert.deepEqual(events, ["provision"]);
});

test("primary lifecycle and execution classifications are complete and exclusive", () => {
  const lifecycleCounts = Object.groupBy(manifest.primary, (entry) => entry.lifecycle.policy);
  assert.equal(Object.values(lifecycleCounts).flat().length, 194);
  assert.ok(lifecycleCounts["authenticated-clean"]?.length > 0);
  assert.ok(lifecycleCounts["persistence-relaunch"]?.length > 0);
  assert.ok(lifecycleCounts["recording-safe"]?.length > 0);
  assert.ok(lifecycleCounts["system-ui"]?.length > 0);

  const executionCounts = Object.groupBy(manifest.primary, (entry) => entry.executionClass);
  assert.equal(Object.values(executionCounts).flat().length, 194);
  assert.equal(executionCounts["intentional-red"]?.length, 22);
  assert.ok(executionCounts["provider-system-picker"]?.length > 0);
  assert.ok(executionCounts["primary-expected-pass"]?.length > 0);
});
