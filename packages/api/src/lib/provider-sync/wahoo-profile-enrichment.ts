import { isValidDateOfBirth, parseDateOfBirth } from "@repo/core/profile";
import type { WahooReconciliationAdmission } from "../../application/integrations/wahoo-reconciliation-admission";
import type { DrizzleTransactionClient } from "../../db";
import type { WahooSyncRepository } from "../../repositories/wahoo-sync-repository";
import type { WahooUser } from "../integrations/wahoo/client";

export const WAHOO_PROFILE_ENRICHMENT_JOB = "wahoo.profile_enrichment";
export const WAHOO_PROFILE_ENRICHMENT_RESOURCE = "profile_enrichment";
export const WAHOO_PROFILE_ENRICHMENT_SYNC_MODE = "fill_absent_profile_data";

export function getWahooProfileEnrichmentResource(
  _trigger: WahooProfileEnrichmentPayload["trigger"],
): typeof WAHOO_PROFILE_ENRICHMENT_RESOURCE {
  return WAHOO_PROFILE_ENRICHMENT_RESOURCE;
}

export type WahooProfileEnrichmentPayload = {
  trigger: "connect" | "manual" | "onboarding";
};

export function isWahooProfileEnrichmentPayload(
  value: unknown,
): value is WahooProfileEnrichmentPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      "trigger" in value &&
      (value.trigger === "connect" || value.trigger === "manual" || value.trigger === "onboarding"),
  );
}

export function normalizeWahooProfileEnrichment(user: WahooUser): {
  dob?: Date;
  gender?: "male" | "female" | "other";
  weightKg?: number;
} {
  const result: {
    dob?: Date;
    gender?: "male" | "female" | "other";
    weightKg?: number;
  } = {};

  if (typeof user.birth === "string" && isValidDateOfBirth(user.birth)) {
    const dob = parseDateOfBirth(user.birth);
    if (dob) result.dob = dob;
  }
  if (user.gender === 0) result.gender = "male";
  else if (user.gender === 1) result.gender = "female";
  else if (user.gender === 2) result.gender = "other";
  const weight =
    typeof user.weight === "number"
      ? user.weight
      : typeof user.weight === "string"
        ? Number.parseFloat(user.weight)
        : Number.NaN;
  if (Number.isFinite(weight) && weight >= 30 && weight <= 300) result.weightKg = weight;

  return result;
}

export async function enqueueWahooProfileEnrichment(input: {
  admission: Extract<WahooReconciliationAdmission, { admitted: true }>;
  providerSyncRepository: WahooSyncRepository;
  transaction?: DrizzleTransactionClient;
}) {
  if (input.admission.target !== "profile_enrichment") {
    throw new Error("Wahoo profile enrichment requires an admitted profile-enrichment target");
  }
  const jobInput = {
    dedupeKey: `wahoo-profile-enrichment:${input.admission.integrationId}:${input.admission.generation}`,
    integrationGeneration: input.admission.generation,
    integrationId: input.admission.integrationId,
    jobType: WAHOO_PROFILE_ENRICHMENT_JOB,
    maxAttempts: 5,
    operation: "fill_absent",
    payload: { trigger: input.admission.trigger },
    priority: 20,
    profileId: input.admission.profileId,
    provider: "wahoo",
    runAt: new Date().toISOString(),
    syncLaneKey: `wahoo:${input.admission.integrationId}:profile-enrichment`,
  } as const;
  return input.transaction
    ? input.providerSyncRepository.enqueueJobInTransaction(input.transaction, jobInput)
    : input.providerSyncRepository.enqueueJob(jobInput);
}
