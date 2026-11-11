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
});
