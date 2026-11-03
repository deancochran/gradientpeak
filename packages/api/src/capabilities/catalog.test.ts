import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { appRouter } from "../routers";
import {
  apiCapabilitySchema,
  apiOperationPolicyOverrides,
  apiResourceBoundaryEvidence,
  createApiCapabilityCatalog,
  createCapabilityEvidenceRegistry,
  reconcileApiCapabilityCatalog,
} from "./catalog";
import {
  apiCapabilityCatalog,
  apiRouterInventory,
  capabilityEvidenceRegistry,
  discoverRouterInventory,
} from "./generated";

const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");
const existingEvidenceTestPaths = new Set(
  capabilityEvidenceRegistry
    .map((evidence) => evidence.path)
    .filter((testPath) => existsSync(path.join(repositoryRoot, testPath))),
);
const existingEvidenceTestNames = new Map(
  [...existingEvidenceTestPaths].map((testPath) => {
    const source = readFileSync(path.join(repositoryRoot, testPath), "utf8");
    return [
      testPath,
      new Set(
        [...source.matchAll(/\b(?:it|test)\s*\(\s*["'`]([^"'`]+)["'`]/g)]
          .map((match) => match[1])
          .filter((name): name is string => Boolean(name)),
      ),
    ] as const;
  }),
);

function reconcile(overrides: Partial<Parameters<typeof reconcileApiCapabilityCatalog>[0]> = {}) {
  return reconcileApiCapabilityCatalog({
    actualProcedures: apiRouterInventory,
    catalog: apiCapabilityCatalog,
    evidence: capabilityEvidenceRegistry,
    existingTestPaths: existingEvidenceTestPaths,
    existingTestNames: existingEvidenceTestNames,
    ...overrides,
  });
}

describe("generated API inventory", () => {
  it("derives the complete sorted operation id and procedure type inventory from appRouter", () => {
    const discovered = discoverRouterInventory(appRouter as never);
    expect(discovered).toEqual(apiRouterInventory);
    expect(new Set(discovered.map((item) => item.id)).size).toBe(discovered.length);
    expect(reconcile()).toEqual([]);
  });

  it("executes the authentication boundary for every protected generated operation", async () => {
    const caller = appRouter.createCaller({
      auth: { lookupInput: { clientType: "web", headers: new Headers() }, session: null },
      authSession: null,
      clientType: "web",
      headers: new Headers(),
      session: null,
      trpcSource: "vitest",
    } as never) as unknown;

    for (const capability of apiCapabilityCatalog.filter(
      (entry) => entry.authorizationAssurance === "authentication_boundary",
    )) {
      expect(capability.authorizationPolicy, capability.id).toBe("authenticated-session.v1");
      let procedure = caller;
      for (const segment of capability.id.split(".")) {
        procedure = (procedure as Record<string, unknown>)[segment];
      }
      expect(typeof procedure, capability.id).toBe("function");
      await expect(
        (procedure as (input: undefined) => Promise<unknown>)(undefined),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("fails for an unclassified real operation and a stale generated catalog row", () => {
    const unknown = { id: "unknownDomain.example", procedureType: "query" as const };
    const unknownCatalog = createApiCapabilityCatalog([...apiRouterInventory, unknown]);
    const unknownEvidence = createCapabilityEvidenceRegistry(unknownCatalog);
    const issues = reconcile({
      actualProcedures: [...apiRouterInventory, unknown],
      catalog: unknownCatalog,
      evidence: unknownEvidence,
    });
    expect(issues).toContain("unclassified appRouter operation: unknownDomain.example");
    expect(issues).toContain(
      "unknownDomain.example: no valid router/domain policy classifies this operation",
    );

    const stale = { ...apiCapabilityCatalog[0], id: "retired.staleOperation" };
    expect(reconcile({ catalog: [...apiCapabilityCatalog, stale] })).toContain(
      "stale catalog operation not exposed by appRouter: retired.staleOperation",
    );
  });

  it("fails for stale, unknown, and type-invalid policy overrides", () => {
    const operationOverrides = {
      ...apiOperationPolicyOverrides,
      "profiles.get": { mutationSafety: "transactional" },
      "retired.missing": { scope: "web_only" },
    };
    const issues = reconcile({ operationOverrides });
    expect(issues).toContain(
      "profiles.get: mutation safety override applies to a non-mutation operation",
    );
    expect(issues).toContain("stale operation policy override: retired.missing");
  });

  it("strictly rejects invalid access, scope, and required-test decisions", () => {
    const capability = apiCapabilityCatalog.find((item) => item.id === "profiles.get");
    expect(capability).toBeDefined();
    if (!capability) return;
    expect(
      apiCapabilitySchema.safeParse({
        ...capability,
        access: "anonymous",
        platform: { ...capability.platform, scope: "desktop_only" },
        testRequirements: ["contract"],
      }).success,
    ).toBe(false);
  });

  it("rejects a resource-boundary policy claim without exact per-operation proof", () => {
    const { "publicShare.activity": _removed, ...incompleteBindings } = apiResourceBoundaryEvidence;
    const issues = reconcile({ resourceBoundaryEvidence: incompleteBindings });
    expect(issues).toContain(
      "publicShare.activity: resource-boundary policy claim lacks a strict per-operation evidence binding",
    );

    const evidence = capabilityEvidenceRegistry.map((item) =>
      item.id === "authorization:publicShare.activity"
        ? { ...item, testName: "a test title that does not exist" }
        : item,
    );
    expect(reconcile({ evidence })).toContain(
      "publicShare.activity: resource-boundary authorization evidence does not match its exact bound test",
    );
  });
});

describe("API capability proof decisions", () => {
  it("fails when required executable proof is missing or bound to a generic operation list", () => {
    const evidence = capabilityEvidenceRegistry.map((item) =>
      item.id === "authorization:profiles.get"
        ? {
            ...item,
            path: "packages/api/src/routers/__tests__/missing.test.ts",
            procedureIds: ["profiles.get", "profiles.update"],
          }
        : item,
    );
    const issues = reconcile({ evidence });
    expect(issues).toContain(
      "authorization:profiles.get: executable evidence test path does not exist: packages/api/src/routers/__tests__/missing.test.ts",
    );
    expect(issues).toContain(
      "profiles.get: evidence authorization:profiles.get must bind only this procedure, not profiles.get, profiles.update",
    );
  });
});
