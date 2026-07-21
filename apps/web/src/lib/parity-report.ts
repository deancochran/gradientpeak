import { getRequiredWebParityFeatures, type ParityFeatureStatus } from "@repo/core/parity";

import { webParityManifest } from "./parity-manifest";

const STATUS_CREDIT = {
  implemented: 1,
  "implemented-unverified": 0,
  partial: 0.5,
  scaffold: 0,
  missing: 0,
} as const;

export function getWebParityReport() {
  const requiredFeatures = getRequiredWebParityFeatures();
  const features = requiredFeatures.map((feature) => ({
    id: feature.id,
    status: webParityManifest.features[feature.id] as ParityFeatureStatus,
    title: feature.title,
  }));
  const earned = features.reduce((total, feature) => total + STATUS_CREDIT[feature.status], 0);

  return {
    denominator: features.length,
    implemented: features.filter((feature) => feature.status === "implemented").length,
    implementedUnverified: features.filter(
      (feature) => feature.status === "implemented-unverified",
    ),
    missing: features.filter(
      (feature) => feature.status === "missing" || feature.status === "scaffold",
    ),
    partial: features.filter((feature) => feature.status === "partial"),
    percentage: Number(((earned / features.length) * 100).toFixed(1)),
  };
}
