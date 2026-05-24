import {
  allParityBackendOperationIds,
  allParityFeatureIds,
  getRequiredWebParityFeatures,
} from "@repo/core/parity";

export const mobileParityManifest = {
  backendOperations: Object.fromEntries(
    allParityBackendOperationIds.map((operationId) => [operationId, "implemented"]),
  ),
  features: Object.fromEntries(
    allParityFeatureIds.map((featureId) => [
      featureId,
      featureId === "coaching.dashboard" ? "missing" : "implemented",
    ]),
  ),
  requiredOnWebFeatureIds: getRequiredWebParityFeatures().map((feature) => feature.id),
} as const;
