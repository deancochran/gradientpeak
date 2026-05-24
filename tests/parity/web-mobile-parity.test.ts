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
    const extraInMobileManifest = Object.keys(mobileParityManifest.features).filter(
      (featureId) => !allParityFeatureIds.includes(featureId),
    );
    const extraInWebManifest = Object.keys(webParityManifest.features).filter(
      (featureId) => !allParityFeatureIds.includes(featureId),
    );

    expect(
      [
        ...missingFromMobileManifest,
        ...missingFromWebManifest,
        ...extraInMobileManifest,
        ...extraInWebManifest,
      ],
      [
        formatMissingList("Missing feature ids from mobile manifest", missingFromMobileManifest),
        formatMissingList("Missing feature ids from web manifest", missingFromWebManifest),
        formatMissingList("Extra feature ids in mobile manifest", extraInMobileManifest),
        formatMissingList("Extra feature ids in web manifest", extraInWebManifest),
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
    const extraInMobileManifest = Object.keys(mobileParityManifest.backendOperations).filter(
      (operationId) => !allParityBackendOperationIds.includes(operationId),
    );
    const extraInWebManifest = Object.keys(webParityManifest.backendOperations).filter(
      (operationId) => !allParityBackendOperationIds.includes(operationId),
    );

    expect(
      [
        ...missingFromMobileManifest,
        ...missingFromWebManifest,
        ...extraInMobileManifest,
        ...extraInWebManifest,
      ],
      [
        formatMissingList(
          "Missing backend operation ids from mobile manifest",
          missingFromMobileManifest,
        ),
        formatMissingList(
          "Missing backend operation ids from web manifest",
          missingFromWebManifest,
        ),
        formatMissingList("Extra backend operation ids in mobile manifest", extraInMobileManifest),
        formatMissingList("Extra backend operation ids in web manifest", extraInWebManifest),
      ]
        .filter(Boolean)
        .join("\n\n"),
    ).toEqual([]);
  });

  it("uses only known parity statuses in manifests", () => {
    const invalidMobileFeatureStatuses = Object.entries(mobileParityManifest.features)
      .filter(([, status]) => !parityFeatureStatusSchema.safeParse(status).success)
      .map(([featureId, status]) => `${featureId} :: invalid mobile feature status ${status}`);
    const invalidMobileBackendStatuses = Object.entries(mobileParityManifest.backendOperations)
      .filter(([, status]) => !parityBackendOperationStatusSchema.safeParse(status).success)
      .map(([operationId, status]) => `${operationId} :: invalid mobile backend status ${status}`);
    const invalidFeatureStatuses = Object.entries(webParityManifest.features)
      .filter(([, status]) => !parityFeatureStatusSchema.safeParse(status).success)
      .map(([featureId, status]) => `${featureId} :: invalid feature status ${status}`);
    const invalidBackendStatuses = Object.entries(webParityManifest.backendOperations)
      .filter(([, status]) => !parityBackendOperationStatusSchema.safeParse(status).success)
      .map(([operationId, status]) => `${operationId} :: invalid backend status ${status}`);

    expect(
      [
        ...invalidMobileFeatureStatuses,
        ...invalidMobileBackendStatuses,
        ...invalidFeatureStatuses,
        ...invalidBackendStatuses,
      ],
      [
        formatMissingList("Invalid mobile feature statuses", invalidMobileFeatureStatuses),
        formatMissingList("Invalid mobile backend statuses", invalidMobileBackendStatuses),
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
      "auth.verify_email": "implemented",
      "messaging.detail": "partial",
      "messaging.new": "partial",
      "notifications.list": "implemented",
      "planning.calendar_tab": "implemented",
      "planning.plan_tab": "partial",
      "profile.settings": "partial",
      "record.launcher": "implemented",
      "record.plan": "partial",
      "record.route": "implemented",
      "record.route_preview": "implemented",
      "record.submit": "implemented",
      "scheduled_activities.event_detail": "partial",
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
