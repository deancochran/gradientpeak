import { describe, expect, it } from "vitest";

import { mobileParityManifest } from "../../apps/mobile/lib/parity-manifest";
import { webParityManifest } from "../../apps/web/src/lib/parity-manifest";
import {
  allParityBackendOperationIds,
  allParityFeatureIds,
  getRequiredWebParityFeatures,
  parityBackendOperationStatusSchema,
  parityFeatureStatusSchema,
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

  it("uses only known parity statuses in manifests", () => {
    const invalidFeatureStatuses = Object.entries(webParityManifest.features)
      .filter(([, status]) => !parityFeatureStatusSchema.safeParse(status).success)
      .map(([featureId, status]) => `${featureId} :: invalid feature status ${status}`);
    const invalidBackendStatuses = Object.entries(webParityManifest.backendOperations)
      .filter(([, status]) => !parityBackendOperationStatusSchema.safeParse(status).success)
      .map(([operationId, status]) => `${operationId} :: invalid backend status ${status}`);

    expect(
      [...invalidFeatureStatuses, ...invalidBackendStatuses],
      [
        formatMissingList("Invalid feature statuses", invalidFeatureStatuses),
        formatMissingList("Invalid backend statuses", invalidBackendStatuses),
      ]
        .filter(Boolean)
        .join("\n\n"),
    ).toEqual([]);
  });

  it("does not overstate implemented web features", () => {
    const overstatedFeatures = getRequiredWebParityFeatures()
      .filter((feature) => webParityManifest.features[feature.id] === "implemented")
      .map((feature) => ({
        feature,
        missingOperations: feature.backendOperations.filter(
          (operationId) => webParityManifest.backendOperations[operationId] !== "implemented",
        ),
      }))
      .filter(({ missingOperations }) => missingOperations.length > 0)
      .map(
        ({ feature, missingOperations }) =>
          `${feature.id} (${feature.title}) :: marked implemented but missing backend coverage for ${missingOperations.join(", ")}`,
      );

    expect(
      overstatedFeatures,
      formatMissingList("Web features are overstated as implemented", overstatedFeatures),
    ).toEqual([]);
  });

  it("keeps known in-progress web parity statuses honest", () => {
    const expectedFeatureStatuses = {
      "auth.verify_email": "missing",
      "messaging.detail": "partial",
      "messaging.new": "missing",
      "notifications.list": "partial",
      "planning.calendar_tab": "scaffold",
      "planning.plan_tab": "scaffold",
      "profile.settings": "partial",
      "record.launcher": "scaffold",
      "record.plan": "missing",
      "record.route": "missing",
      "record.route_preview": "missing",
      "record.submit": "missing",
    } as const;

    const mismatches = Object.entries(expectedFeatureStatuses)
      .filter(
        ([featureId, expectedStatus]) => webParityManifest.features[featureId] !== expectedStatus,
      )
      .map(
        ([featureId, expectedStatus]) =>
          `${featureId} :: expected ${expectedStatus} :: actual ${webParityManifest.features[featureId]}`,
      );

    expect(
      mismatches,
      formatMissingList("Known in-progress web parity statuses drifted", mismatches),
    ).toEqual([]);
  });
});
