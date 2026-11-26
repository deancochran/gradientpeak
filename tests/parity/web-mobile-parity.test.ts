import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverUserFacingSurfaces,
  loadReferenceSources,
  validateParity,
} from "../../tooling/testing/parity.mjs";
import {
  buildParityRegistry,
  paritySurfaceExceptions,
} from "../../tooling/testing/parity-registry.mjs";

const root = path.resolve(import.meta.dirname, "../..");

describe("web/mobile capability inventory", () => {
  it("classifies every current user-facing source and keeps references current", async () => {
    const records = await buildParityRegistry(root);
    const result = validateParity({
      discoveredSurfaces: await discoverUserFacingSurfaces(root),
      exceptions: paritySurfaceExceptions,
      records,
      referenceSources: await loadReferenceSources(root, records),
    });
    expect(result.issues).toEqual([]);
    expect(result.referenceIssues).toEqual([]);
    expect(result.unclassified).toEqual([]);
    expect(records.find((record) => record.id === "auth.access")?.policy).toBe("both");
    expect(records.find((record) => record.id === "record.sensors")?.policy).toBe("mobile_only");
    expect(records.find((record) => record.id === "record.sensors")?.mobile.implementation).toBe(
      "implemented",
    );
  });

  it("classifies athlete permission settings without claiming native coaching workspaces or runtime proof", async () => {
    const records = await buildParityRegistry(root);
    const route = "apps/mobile/app/(internal)/(standard)/coaching-permissions.tsx";
    const settings = records.find((record) => record.id === "settings.manage");
    expect(settings?.mobile.sources).toContain(route);
    expect(settings?.mobile.tests).toEqual([
      {
        kind: "jest",
        path: "apps/mobile/app/(internal)/(standard)/__tests__/settings.jest.test.tsx",
      },
      {
        kind: "jest",
        path: "apps/mobile/app/(internal)/(standard)/__tests__/coaching-permissions.jest.test.tsx",
      },
      {
        kind: "jest",
        path: "apps/mobile/components/coaching/CoachingPublicationPermissions.jest.test.tsx",
      },
    ]);
    expect(settings?.mobile.evidenceStrength).toBe("screen/component");
    expect(settings?.mobile.missingSteps).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "proof" })]),
    );
    expect(
      records.filter((record) => record.mobile.sources.includes(route)).map(({ id }) => id),
    ).toEqual(["settings.manage"]);
    const workspace = records.find((record) => record.id === "coaching.workspace");
    expect(workspace?.policy).toBe("web_only");
    expect(workspace?.mobile.implementation).toBe("intentional_absence");
  });
});
