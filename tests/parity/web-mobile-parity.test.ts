import { describe, expect, it } from "vitest";

import { mobileParityManifest } from "../../apps/mobile/lib/parity-manifest";
import { webParityManifest } from "../../apps/web/src/lib/parity-manifest";
import {
  allParityBackendOperationIds,
  allParityFeatureIds,
  getRequiredWebParityFeatures,
  parityRegistry,
} from "../../packages/core/parity";

function formatMissingList(title: string, items: string[]) {
  return `${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

describe("mobile-to-web parity registry", () => {
  it("has unique feature ids", () => {
    const ids = parityRegistry.map((feature) => feature.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every feature in the mobile and web manifests", () => {
    const missingFromMobileManifest = allParityFeatureIds.filter(
      (featureId) => !(featureId in mobileParityManifest.features),
    );
    const missingFromWebManifest = allParityFeatureIds.filter(
      (featureId) => !(featureId in webParityManifest.features),
    );

    expect(
      [...missingFromMobileManifest, ...missingFromWebManifest],
      [
        formatMissingList("Missing feature ids from mobile manifest", missingFromMobileManifest),
        formatMissingList("Missing feature ids from web manifest", missingFromWebManifest),
      ]
        .filter(Boolean)
        .join("\n\n"),
    ).toEqual([]);
  });

  it("covers every backend operation in the mobile and web manifests", () => {
    const missingFromMobileManifest = allParityBackendOperationIds.filter(
      (operationId) => !(operationId in mobileParityManifest.backendOperations),
    );
    const missingFromWebManifest = allParityBackendOperationIds.filter(
      (operationId) => !(operationId in webParityManifest.backendOperations),
    );

    expect(
      [...missingFromMobileManifest, ...missingFromWebManifest],
      [
        formatMissingList(
          "Missing backend operation ids from mobile manifest",
          missingFromMobileManifest,
        ),
        formatMissingList(
          "Missing backend operation ids from web manifest",
          missingFromWebManifest,
        ),
      ]
        .filter(Boolean)
        .join("\n\n"),
    ).toEqual([]);
  });

  it("implements every mobile-required feature on web", () => {
    const missingFeatures = getRequiredWebParityFeatures()
      .filter((feature) => webParityManifest.features[feature.id] !== "implemented")
      .map(
        (feature) =>
          `${feature.id} (${feature.title}) :: mobile route ${feature.mobileRoute} :: web status ${webParityManifest.features[feature.id]}`,
      );

    expect(
      missingFeatures,
      formatMissingList("Web is missing required mobile features", missingFeatures),
    ).toEqual([]);
  });

  it("implements every backend operation needed by mobile-required features on web", () => {
    const requiredOperations = Array.from(
      new Set(getRequiredWebParityFeatures().flatMap((feature) => feature.backendOperations)),
    ).sort();

    const missingOperations = requiredOperations
      .filter((operationId) => webParityManifest.backendOperations[operationId] !== "implemented")
      .map(
        (operationId) =>
          `${operationId} :: web status ${webParityManifest.backendOperations[operationId]}`,
      );

    expect(
      missingOperations,
      formatMissingList("Web is missing required mobile backend coverage", missingOperations),
    ).toEqual([]);
  });
});
