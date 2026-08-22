import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import { test } from "node:test";
import {
  changedCapabilityIds,
  configuredPlaywrightProjects,
  journeyCommand,
  parseMaestroResult,
  parsePlaywrightResult,
  runRegisteredJourneys,
  selectChangedCapabilities,
  selectRegisteredJourneys,
  validateChangedCapabilityProof,
  validateRegistryStructure,
} from "./capability-runner.mjs";

const platform = (tests = [], status = "active") => ({ sources: [], tests, status });
const record = (id, policy = "both", tests = { web: [], mobile: [] }) => ({
  id,
  policy,
  web: platform(tests.web),
  mobile: platform(tests.mobile),
});

test("shared changes select both exact registered runtime journeys", () => {
  const records = [
    record("shared.changed", "both", {
      web: [{ kind: "playwright", path: "apps/web/e2e/a.spec.ts", identity: "web journey" }],
      mobile: [
        {
          kind: "maestro",
          path: "apps/mobile/.maestro/flows/journeys/a.yaml",
          identity: "mobile journey",
        },
      ],
    }),
  ];
  const selected = selectChangedCapabilities(
    records,
    ["packages/core/parity/index.ts"],
    ["shared.changed"],
  );
  const journeys = selectRegisteredJourneys(selected);
  assert.equal(journeys.missing.length, 0);
  assert.deepEqual(
    journeys.journeys.map((journey) => journey.platform),
    ["web", "mobile"],
  );
});

test("registry comparison catches edits, additions, and deletions", () => {
  assert.deepEqual(
    changedCapabilityIds(
      [{ id: "same", policy: "both" }, { id: "edited", policy: "both" }, { id: "deleted" }],
      [{ id: "same", policy: "both" }, { id: "edited", policy: "web_only" }, { id: "added" }],
    ),
    ["added", "deleted", "edited"],
  );
});

test("changed proof validates registry structure before selecting journeys", () => {
  const schema = {
    safeParse: (value) =>
      value.valid
        ? { success: true }
        : { success: false, error: { issues: [{ path: ["valid"], message: "must be true" }] } },
  };
  assert.deepEqual(
    validateRegistryStructure(
      [
        { id: "bad", valid: false },
        { id: "bad", valid: false },
      ],
      schema,
    ),
    ["bad: valid: must be true", "duplicate capability id: bad"],
  );
});

test("unchanged capabilities are ignored and missing journeys are proof gaps", () => {
  const records = [record("unchanged.one"), record("changed.two", "web_only")];
  assert.deepEqual(
    selectChangedCapabilities(records, [], ["changed.two"]).map((item) => item.id),
    ["changed.two"],
  );
  assert.deepEqual(selectRegisteredJourneys([record("changed.two", "web_only")]).missing, [
    { capabilityId: "changed.two", platform: "web", reason: "no registered runtime journey" },
  ]);
});

test("decision-pending and implementation/proof gaps remain visible to enforcement", () => {
  const pending = record("decision.pending");
  pending.web.status = "decision_pending";
  const selection = selectRegisteredJourneys([pending]);
  assert.equal(selection.missing.length, 2);
  assert.equal(selection.missing[0].reason, "no registered runtime journey");
});

test("journey execution fails closed for skipped or unavailable journeys", async () => {
  const journey = {
    capabilityId: "changed.one",
    platform: "web",
    configuredProjects: ["project"],
    reference: { kind: "playwright", path: "apps/web/e2e/a.spec.ts", identity: "exact" },
  };
  assert.deepEqual(journeyCommand(journey).args, [
    "test:e2e:web",
    "e2e/a.spec.ts",
    "--grep",
    "(?:^|\\s)exact$",
    "--reporter=json",
  ]);
  const report = JSON.stringify({
    suites: [
      { specs: [{ title: "exact", tests: [{ title: "exact", results: [{ status: "passed" }] }] }] },
    ],
  });
  const skipped = await runRegisteredJourneys([journey], {
    cwd: "/repo",
    run: async () => {
      const error = new Error("skipped");
      error.code = "SKIPPED";
      throw error;
    },
  });
  assert.equal(skipped[0].status, "failed");
  const unavailable = await runRegisteredJourneys([journey], {
    cwd: "/repo",
    run: async () => {
      const error = new Error("missing runner");
      error.code = "ENOENT";
      throw error;
    },
  });
  assert.equal(unavailable[0].status, "unavailable");
  const passed = await runRegisteredJourneys([journey], {
    cwd: "/repo",
    run: async () => ({ stdout: report }),
  });
  assert.equal(passed[0].status, "passed");
});

test("Playwright matches nested full title paths and rejects ambiguous or empty results", () => {
  const projects = ["project"];
  const nested = parsePlaywrightResult(
    JSON.stringify({
      suites: [
        {
          title: "project",
          suites: [
            {
              title: "describe",
              specs: [
                { title: "exact", tests: [{ title: "exact", results: [{ status: "passed" }] }] },
              ],
            },
          ],
        },
      ],
    }),
    "project describe exact",
    projects,
  );
  assert.equal(nested.status, "passed");
  assert.equal(
    parsePlaywrightResult(
      JSON.stringify({
        suites: [
          {
            specs: [
              { title: "exact", tests: [{ title: "exact", results: [{ status: "passed" }] }] },
            ],
          },
        ],
      }),
      "exact",
      projects,
    ).status,
    "passed",
  );
  assert.equal(
    parsePlaywrightResult(
      JSON.stringify({
        suites: [
          {
            specs: [
              { title: "a.* (x)", tests: [{ title: "a.* (x)", results: [{ status: "passed" }] }] },
            ],
          },
        ],
      }),
      "a.* (x)",
      projects,
    ).status,
    "passed",
  );
  const skipped = parsePlaywrightResult(
    JSON.stringify({
      suites: [{ specs: [{ title: "exact", tests: [{ title: "exact", status: "skipped" }] }] }],
    }),
    "exact",
    projects,
  );
  assert.equal(skipped.status, "gap");
  const multiple = parsePlaywrightResult(
    JSON.stringify({
      suites: [{ specs: [{ title: "exact", tests: [{ title: "exact" }, { title: "exact" }] }] }],
    }),
    "exact",
    projects,
  );
  assert.equal(multiple.status, "gap");
  assert.equal(
    parsePlaywrightResult(
      JSON.stringify({ suites: [{ specs: [{ title: "exact", tests: [{ title: "exact" }] }] }] }),
      "exact",
      projects,
    ).status,
    "gap",
  );
  assert.equal(
    parsePlaywrightResult(JSON.stringify({ suites: [] }), "exact", projects).status,
    "gap",
  );
});

test("Playwright requires one passed identity result in every configured project", () => {
  const makeReport = (projects) =>
    JSON.stringify({
      suites: projects.map((project) => ({
        title: project,
        specs: [
          {
            title: "journey",
            tests: [{ title: "journey", projectName: project, results: [{ status: "passed" }] }],
          },
        ],
      })),
    });
  assert.equal(
    parsePlaywrightResult(makeReport(configuredPlaywrightProjects), "journey").status,
    "passed",
  );
  assert.equal(
    parsePlaywrightResult(makeReport(configuredPlaywrightProjects.slice(1)), "journey").status,
    "gap",
  );
  const duplicate = JSON.parse(makeReport(configuredPlaywrightProjects));
  duplicate.suites[0].specs[0].tests.push({
    title: "journey",
    projectName: configuredPlaywrightProjects[0],
    results: [{ status: "passed" }],
  });
  assert.equal(parsePlaywrightResult(JSON.stringify(duplicate), "journey").status, "gap");
  const skipped = JSON.parse(makeReport(configuredPlaywrightProjects));
  skipped.suites[1].specs[0].tests[0].results = [{ status: "skipped" }];
  assert.equal(parsePlaywrightResult(JSON.stringify(skipped), "journey").status, "gap");
  const extraneous = JSON.parse(makeReport(configuredPlaywrightProjects));
  extraneous.suites.push({
    title: "WebKit",
    specs: [
      {
        title: "journey",
        tests: [{ title: "journey", projectName: "WebKit", results: [{ status: "passed" }] }],
      },
    ],
  });
  assert.equal(parsePlaywrightResult(JSON.stringify(extraneous), "journey").status, "gap");
});

test("Maestro JUnit must contain one named successful result", () => {
  assert.equal(
    parseMaestroResult(
      '<testsuite><testcase name="record.quick_start"/></testsuite>',
      "record.quick_start",
    ).status,
    "passed",
  );
  assert.equal(
    parseMaestroResult('<testsuite><testcase name="other"/></testsuite>', "record.quick_start")
      .status,
    "gap",
  );
  assert.equal(
    parseMaestroResult(
      '<testsuite><testcase name="record.quick_start"><skipped/></testcase></testsuite>',
      "record.quick_start",
    ).status,
    "failed",
  );
});

test("changed proof rejects lower-layer, policy, and metadata regressions", () => {
  const base = [
    {
      ...record("record.changed", "both", {
        web: [{ kind: "contract", path: "contract.test.ts" }],
        mobile: [{ kind: "live-db", path: "db.test.ts" }],
      }),
      ownerArea: "recording",
      priority: "P0",
      requiredTestKinds: ["contract", "live-db"],
    },
  ];
  const current = [
    {
      ...base[0],
      ownerArea: "other",
      priority: "P1",
      policy: "web_only",
      requiredTestKinds: ["contract"],
      mobile: { ...base[0].mobile, tests: [], status: "active" },
    },
  ];
  const issues = validateChangedCapabilityProof(base, current);
  assert.match(issues.join("\n"), /owner metadata regressed/);
  assert.match(issues.join("\n"), /priority metadata regressed/);
  assert.match(issues.join("\n"), /required lower-layer test kind regressed: live-db/);
  assert.match(issues.join("\n"), /mobile lower-layer evidence regressed: live-db/);
  assert.match(issues.join("\n"), /policy narrowed/);
});

test("platform removal fails proof even for lateral policy swaps", () => {
  for (const [basePolicy, currentPolicy, platform] of [
    ["web_only", "mobile_only", "web"],
    ["mobile_only", "web_only", "mobile"],
  ]) {
    const base = [record("record.changed", basePolicy)];
    const current = [{ ...base[0], policy: currentPolicy }];
    assert.deepEqual(validateChangedCapabilityProof(base, current), [
      `record.changed: ${platform} intended platform was removed`,
    ]);
  }
});

test("valid platform expansion and no-change registries pass regression checks", () => {
  const base = [
    {
      ...record("record.changed", "web_only"),
      ownerArea: "recording",
      priority: "P0",
      requiredTestKinds: ["contract"],
    },
  ];
  const current = [
    {
      ...base[0],
      policy: "both",
    },
  ];
  assert.deepEqual(validateChangedCapabilityProof(base, current), []);
  assert.deepEqual(validateChangedCapabilityProof(base, base), []);
});

test("Maestro receipts use unique temporary paths and are cleaned up", async () => {
  const journey = {
    capabilityId: "record.changed",
    platform: "mobile",
    reference: {
      kind: "maestro",
      path: "apps/mobile/.maestro/a.yaml",
      identity: "record.quick_start",
    },
  };
  const paths = [];
  const results = await runRegisteredJourneys([journey, journey], {
    cwd: "/repo",
    run: async (_command, _args, options) => {
      const receipt = options.env.MAESTRO_JUNIT_OUTPUT;
      paths.push(receipt);
      await writeFile(receipt, '<testsuite><testcase name="record.quick_start"/></testsuite>');
      return { stdout: "not parsed" };
    },
  });
  assert.deepEqual(
    results.map((result) => result.status),
    ["passed", "passed"],
  );
  assert.notEqual(paths[0], paths[1]);
  await assert.rejects(access(paths[0]));
  await assert.rejects(access(paths[1]));
});
