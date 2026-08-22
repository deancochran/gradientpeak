import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { directCiSmokeReferences } from "../../tooling/qa/profiles.mjs";
import {
  classifyParity,
  discoverUserFacingSurfaces,
  evaluateCompletion,
  formatParityReport,
  loadReferenceSources,
  parityExitCode,
  validateParity,
} from "../../tooling/testing/parity.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const { atomicCapabilityRegistry, atomicCapabilitySchema, paritySurfaceExceptions } = await import(
  pathToFileURL(path.join(root, "packages/core/parity/index.ts")).href
);

const proofGap = (stepId: string) => ({
  detail: "No maintained runtime flow currently proves this representative user step.",
  kind: "proof" as const,
  stepId,
});
const implementationGap = (stepId: string) => ({
  detail: "This representative required user step is not implemented on the platform.",
  kind: "implementation" as const,
  stepId,
});

function platform(
  overrides: Record<string, unknown> = {},
  { stepIds = ["complete"] }: { stepIds?: string[] } = {},
) {
  return {
    coveredSteps: stepIds,
    evidenceStrength: "source-only",
    implementation: "implemented",
    missingSteps: stepIds.map(proofGap),
    sources: [],
    tests: [],
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "fixture.outcome",
    intentionalDifferences: [],
    ownerArea: "test surfaces",
    mobile: platform(),
    outcome: "A representative user completes one atomic outcome.",
    priority: "P3",
    policy: "both",
    requiredSteps: [{ description: "Complete the outcome.", id: "complete" }],
    requiredTestKinds: [],
    title: "Fixture outcome",
    web: platform(),
    ...overrides,
  };
}

describe("atomic capability registry", () => {
  it("validates every registered capability, literal source, test reference, and discovered route", async () => {
    const discoveredSurfaces = await discoverUserFacingSurfaces(root);
    const referenceSources = await loadReferenceSources(root, atomicCapabilityRegistry);
    const result = validateParity({
      directCiReferences: directCiSmokeReferences,
      discoveredSurfaces,
      exceptions: paritySurfaceExceptions,
      records: atomicCapabilityRegistry,
      referenceSources,
      schema: atomicCapabilitySchema,
    });
    expect(result.issues).toEqual([]);
    expect(result.unclassified).toEqual([]);
    expect(result.referenceIssues).toEqual([]);
  });

  it("reports directional implementation gaps independently from runtime proof", () => {
    const mobileRuntime = platform({
      evidenceStrength: "runtime",
      missingSteps: [],
      tests: [
        {
          identity: "mobile.complete",
          kind: "maestro",
          path: "apps/mobile/.maestro/flows/smoke/fixture.yaml",
        },
      ],
    });
    const webPartial = platform({
      coveredSteps: [],
      implementation: "partial",
      missingSteps: [implementationGap("complete")],
      sources: ["apps/web/src/routes/fixture.tsx"],
    });
    const classification = classifyParity([record({ mobile: mobileRuntime, web: webPartial })]);
    expect(classification.mobileCompleteWebIncomplete.map((item) => item.id)).toEqual([
      "fixture.outcome",
    ]);
    expect(formatParityReport(classification)).toContain(
      "Implementation summaries use implementation state only. Runtime proof gaps are reported separately.",
    );
  });

  it("uses implementation state for directional summaries even when the present side lacks runtime proof", () => {
    const webPartial = platform({
      coveredSteps: [],
      implementation: "partial",
      missingSteps: [implementationGap("complete")],
    });
    const classification = classifyParity([record({ web: webPartial })]);
    expect(classification.mobileCompleteWebIncomplete.map((item) => item.id)).toEqual([
      "fixture.outcome",
    ]);
    expect(classification.proofGaps.map(({ platform }) => platform)).toEqual(["mobile"]);
  });

  it("requires an exact identity for every Playwright and Maestro reference", () => {
    const missingIdentity = record({
      web: platform({
        evidenceStrength: "runtime",
        missingSteps: [],
        tests: [{ kind: "playwright", path: "apps/web/e2e/specs/fixture.spec.ts" }],
      }),
    });
    const result = atomicCapabilitySchema.safeParse(missingIdentity);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "runtime test references require an exact test identity",
      );
    }
  });

  it("requires registry metadata and evidence for declared lower layers", () => {
    expect(atomicCapabilitySchema.safeParse({ ...record(), priority: undefined }).success).toBe(
      false,
    );
    const invalid = atomicCapabilitySchema.safeParse({ ...record(), requiredTestKinds: ["unit"] });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(invalid.error.issues.map((issue) => issue.message)).toContain(
        "required lower-layer test kind unit has no evidence reference",
      );
  });

  it("reports decision-pending separately and never allows completion", () => {
    const pending = atomicCapabilitySchema.parse({
      ...record({
        web: platform({
          status: "decision_pending",
          missingSteps: [
            {
              detail: "Product behavior is unresolved and needs an explicit decision.",
              kind: "product-decision",
              stepId: "complete",
            },
          ],
        }),
      }),
    });
    const classification = classifyParity([pending]);
    expect(classification.decisionPending).toHaveLength(1);
    expect(parityExitCode({ classification, issues: [], strict: true })).toBe(1);
  });

  it("models a mobile browser handoff separately from the public web reader", () => {
    const handoff = record({
      id: "share.open-public-link",
      priority: "P0",
      requiredTestKinds: ["unit"],
      intentionalDifferences: [
        {
          difference: "Mobile generates a URL while web renders the public reader.",
          rationale:
            "Anonymous public content stays in one canonical browser reader across platforms.",
        },
      ],
      mobile: platform({ sources: ["apps/mobile/components/share.tsx"] }),
      web: platform({
        sources: ["apps/web/src/routes/share/item.tsx"],
        tests: [{ kind: "vitest", path: "apps/web/src/lib/auth/route-guards.test.ts" }],
      }),
    });
    expect(atomicCapabilitySchema.parse(handoff).intentionalDifferences).toHaveLength(1);
    expect(
      classifyParity([atomicCapabilitySchema.parse(handoff)]).intentionalDifferences,
    ).toHaveLength(1);
  });

  it("keeps a source-only route incomplete and supports multiple direct test references", () => {
    const withTests = record({
      web: platform({
        evidenceStrength: "screen/component",
        sources: ["apps/web/src/routes/fixture.tsx"],
        tests: [
          { kind: "vitest", path: "apps/web/src/routes/fixture.test.tsx" },
          { kind: "vitest", path: "apps/web/src/components/fixture.test.tsx" },
        ],
      }),
    });
    const sources = new Map([
      ["apps/web/src/routes/fixture.test.tsx", 'it("route", () => {});'],
      ["apps/web/src/components/fixture.test.tsx", 'it("component", () => {});'],
    ]);
    const validation = validateParity({
      records: [withTests],
      referenceSources: sources,
      schema: atomicCapabilitySchema,
    });
    expect(validation.issues).toEqual([]);
    const classification = classifyParity(validation.records);
    expect(classification.proofGaps.map(({ platform }) => platform)).toEqual(["mobile", "web"]);
    expect(classification.all[0].web.tests).toHaveLength(2);
  });

  it("rejects a parent claim that omits a required child step", () => {
    const hiddenChild = record({
      requiredSteps: [
        { description: "Select a plan.", id: "select" },
        { description: "Execute the selected plan.", id: "execute" },
      ],
      mobile: platform(
        { coveredSteps: ["select"], missingSteps: [proofGap("select")] },
        { stepIds: ["select", "execute"] },
      ),
      web: platform({}, { stepIds: ["select", "execute"] }),
    });
    const result = validateParity({ records: [hiddenChild], schema: atomicCapabilitySchema });
    expect(result.issues).toContain(
      "fixture.outcome: mobile: required step execute has neither evidence nor a recorded gap",
    );
    expect(result.issues).toContain(
      "fixture.outcome: mobile.implementation: implemented disposition requires every required step to be covered",
    );
  });

  it("separates implementation-strict from proof-strict behavior", () => {
    const sourceOnly = classifyParity([atomicCapabilitySchema.parse(record())]);
    expect(
      parityExitCode({ classification: sourceOnly, issues: [], proofStrict: false, strict: true }),
    ).toBe(0);
    expect(
      parityExitCode({ classification: sourceOnly, issues: [], proofStrict: true, strict: false }),
    ).toBe(1);

    const missingWeb = atomicCapabilitySchema.parse(
      record({
        mobile: platform({
          evidenceStrength: "runtime",
          missingSteps: [],
          tests: [
            {
              identity: "mobile.complete",
              kind: "maestro",
              path: "apps/mobile/.maestro/flows/smoke/fixture.yaml",
            },
          ],
        }),
        web: platform({
          coveredSteps: [],
          evidenceStrength: "none",
          implementation: "missing",
          missingSteps: [implementationGap("complete")],
        }),
      }),
    );
    expect(
      parityExitCode({
        classification: classifyParity([missingWeb]),
        issues: [],
        proofStrict: false,
        strict: true,
      }),
    ).toBe(1);
    expect(
      parityExitCode({
        classification: classifyParity([missingWeb]),
        issues: [],
        proofStrict: true,
        strict: false,
      }),
    ).toBe(1);
  });

  it("completes a genuinely green changed-capability run only from that run's receipts", () => {
    const runtime = atomicCapabilitySchema.parse(
      record({
        web: platform({
          evidenceStrength: "runtime",
          missingSteps: [],
          tests: [
            { kind: "playwright", path: "apps/web/e2e/specs/fixture.spec.ts", identity: "fixture" },
          ],
        }),
        mobile: platform({
          evidenceStrength: "runtime",
          missingSteps: [],
          tests: [
            {
              kind: "maestro",
              path: "apps/mobile/.maestro/features/fixture.yaml",
              identity: "fixture",
            },
          ],
        }),
      }),
    );
    const validation = { issues: [], records: [runtime] };
    const result = evaluateCompletion({
      validation,
      records: [runtime],
      journeyResults: [
        { capabilityId: runtime.id, platform: "web", status: "passed" },
        { capabilityId: runtime.id, platform: "mobile", status: "passed" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.runtimeReceipts).toEqual(
      new Set(["fixture.outcome:web", "fixture.outcome:mobile"]),
    );
    expect(evaluateCompletion({ validation, records: [runtime], journeyResults: [] }).ok).toBe(
      false,
    );
  });

  it("reports missing files and stale identities for any referenced evidence", () => {
    const stale = record({
      web: platform({
        evidenceStrength: "runtime",
        missingSteps: [],
        tests: [
          {
            identity: "expected browser flow",
            kind: "playwright",
            path: "apps/web/e2e/specs/fixture.spec.ts",
          },
          { kind: "vitest", path: "apps/web/src/missing.test.ts" },
        ],
      }),
    });
    const result = validateParity({
      records: [stale],
      referenceSources: new Map([
        ["apps/web/e2e/specs/fixture.spec.ts", 'test("different browser flow", () => {});'],
      ]),
      schema: atomicCapabilitySchema,
    });
    expect(result.referenceIssues).toContain(
      'fixture.outcome: stale web evidence identity "expected browser flow" in apps/web/e2e/specs/fixture.spec.ts',
    );
    expect(result.referenceIssues).toContain(
      "fixture.outcome: web evidence reference does not exist: apps/web/src/missing.test.ts",
    );
  });

  it("discovers TypeScript routes while excluding API handlers, tests, and helper modules", async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "parity-route-discovery-"));
    try {
      await Promise.all([
        mkdir(path.join(fixtureRoot, "apps/web/src/routes/api/health"), { recursive: true }),
        mkdir(path.join(fixtureRoot, "apps/mobile/app/__tests__"), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(
          path.join(fixtureRoot, "apps/web/src/routeTree.gen.ts"),
          [
            `import { Route as DashboardRoute } from './routes/dashboard'`,
            `import { Route as HealthRoute } from './routes/api/health/status'`,
          ].join("\n"),
        ),
        writeFile(
          path.join(fixtureRoot, "apps/web/src/routes/dashboard.tsx"),
          "export const Route = {};\n",
        ),
        writeFile(
          path.join(fixtureRoot, "apps/web/src/routes/api/health/status.ts"),
          "export const Route = {};\n",
        ),
        writeFile(
          path.join(fixtureRoot, "apps/web/src/routes/helper.tsx"),
          "export const helper = true;\n",
        ),
        writeFile(
          path.join(fixtureRoot, "apps/mobile/app/settings.ts"),
          "export default function Settings() {}\n",
        ),
        writeFile(
          path.join(fixtureRoot, "apps/mobile/app/settings.test.ts"),
          "throw new Error();\n",
        ),
        writeFile(
          path.join(fixtureRoot, "apps/mobile/app/__tests__/profile.ts"),
          "throw new Error();\n",
        ),
      ]);
      expect(await discoverUserFacingSurfaces(fixtureRoot)).toEqual([
        { path: "apps/mobile/app/settings.ts", platform: "mobile" },
        { path: "apps/web/src/routes/dashboard.tsx", platform: "web" },
      ]);
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });
});
