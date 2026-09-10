import { calculateAgeFromDOB, getOnboardingBaselineProfile } from "@repo/core";
import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import type { getRequiredDb } from "../../db";
import {
  lockOnboardingProfile,
  OnboardingProfileNotFoundForLockError,
  OnboardingStatusConflictError,
} from "../../repositories/onboarding-lifecycle-repository";
import { batchInsertProfileMetrics, prepareProfileMetrics } from "../../utils/onboarding-helpers";
import { readConfiguredProviderSetupEvidence } from "../integrations/provider-runtime-registry";
import {
  OnboardingProfileNotFoundError,
  persistOnboardingProfile,
} from "./persist-onboarding-profile";

type Db = ReturnType<typeof getRequiredDb>;
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class OnboardingRequiredWriteError extends Error {
  constructor(
    public readonly stage: "profile" | "metrics",
    options?: { cause?: unknown },
  ) {
    super(`Failed onboarding ${stage} write`, options);
    this.name = "OnboardingRequiredWriteError";
  }
}

export async function prepareFinalOnboardingProfile(input: {
  db: Db;
  profileId: string;
  data: CompleteOnboarding;
}) {
  const setupData = (await readConfiguredProviderSetupEvidence(input))[0]?.evidence;
  const fieldSources = input.data.baseline_field_sources;
  const effectiveDob = fieldSources?.dob === "cleared" ? undefined : input.data.dob;
  const effectiveGender = fieldSources?.gender === "cleared" ? undefined : input.data.gender;
  const effectiveWeight = fieldSources?.weight_kg === "cleared" ? undefined : input.data.weight_kg;
  const ageForBaseline = effectiveDob ? calculateAgeFromDOB(effectiveDob) : 30;
  const canGenerateBaseline =
    input.data.experience_level !== "skip" &&
    input.data.experience_level !== "advanced" &&
    effectiveWeight !== undefined &&
    effectiveGender !== undefined;
  const baseline = canGenerateBaseline
    ? getOnboardingBaselineProfile(input.data.experience_level, effectiveGender, ageForBaseline)
    : null;
  const preserveImportedFields = new Set<"weight_kg" | "max_hr" | "resting_hr">();
  if (
    fieldSources?.weight_kg === "imported" &&
    input.data.weight_kg !== undefined &&
    input.data.weight_kg === setupData?.values.weight_kg
  ) {
    preserveImportedFields.add("weight_kg");
  }
  const importedProvenance = Object.fromEntries(
    Object.entries(setupData?.sources ?? {}).map(([field, source]) => [
      field,
      { provider: source.provider, source_recorded_at: source.sourceRecordedAt },
    ]),
  );
  return prepareProfileMetrics(
    {
      ...(effectiveWeight === undefined ? {} : { weight_kg: effectiveWeight }),
      ...(input.data.max_hr === undefined ? {} : { max_hr: input.data.max_hr }),
      ...(input.data.resting_hr === undefined ? {} : { resting_hr: input.data.resting_hr }),
      ...(input.data.vo2max === undefined ? {} : { vo2max: input.data.vo2max }),
    },
    baseline,
    { fieldSources, importedProvenance, preserveImportedFields },
  );
}

async function writeRequiredProfile(input: {
  tx: Transaction;
  profileId: string;
  data: CompleteOnboarding;
  metrics: Awaited<ReturnType<typeof prepareFinalOnboardingProfile>>;
  onboardingStatus?: "provider_selection" | "completed";
}) {
  await persistOnboardingProfile({
    tx: input.tx,
    profileId: input.profileId,
    input: { ...input.data, username: input.data.username.toLowerCase() },
    onboardingStatus: input.onboardingStatus,
  });
  await batchInsertProfileMetrics(input.tx, input.profileId, input.metrics);
}

/** Saves a reversible onboarding draft. It never advances the lifecycle. */
export async function saveOnboardingDraft(input: {
  db: Db;
  profileId: string;
  data: CompleteOnboarding;
}) {
  const writeStage: "profile" = "profile";
  let status: "provider_selection" | "processing" | "review" = "provider_selection";
  try {
    await input.db.transaction(async (tx) => {
      const profile = await lockOnboardingProfile(tx, input.profileId);
      if (profile.onboarding_status === "completed") {
        throw new OnboardingStatusConflictError(
          ["provider_selection", "processing", "review"],
          profile.onboarding_status,
        );
      }
      status = profile.onboarding_status;
      await persistOnboardingProfile({
        tx,
        profileId: input.profileId,
        input: { ...input.data, username: input.data.username.toLowerCase() },
      });
    });
  } catch (error) {
    if (
      error instanceof OnboardingProfileNotFoundError ||
      error instanceof OnboardingProfileNotFoundForLockError ||
      error instanceof OnboardingStatusConflictError
    ) {
      throw error;
    }
    throw new OnboardingRequiredWriteError(writeStage, { cause: error });
  }
  return { status };
}

export async function persistFinalOnboardingProfile(input: {
  tx: Transaction;
  profileId: string;
  data: CompleteOnboarding;
  metrics: Awaited<ReturnType<typeof prepareFinalOnboardingProfile>>;
}) {
  await writeRequiredProfile({ ...input, onboardingStatus: "completed" });
  return input.metrics.length;
}

export function finalOnboardingProfileMatches(
  persisted: {
    dob: Date | null;
    full_name: string | null;
    gender: "male" | "female" | "other" | null;
    planning_timezone: string | null;
    username: string | null;
  },
  requested: CompleteOnboarding,
): boolean {
  const requestedDob =
    requested.baseline_field_sources?.dob === "cleared" ? null : (requested.dob ?? null);
  const persistedDob = persisted.dob ? persisted.dob.toISOString().slice(0, 10) : null;
  return (
    persisted.full_name === requested.full_name &&
    persisted.username === requested.username.toLowerCase() &&
    persistedDob === requestedDob &&
    persisted.gender ===
      (requested.baseline_field_sources?.gender === "cleared"
        ? null
        : (requested.gender ?? null)) &&
    persisted.planning_timezone === (requested.planning_timezone ?? null)
  );
}

export function finalOnboardingMetricsMatch(
  persisted: Array<{
    calculation_version: string | null;
    method: string | null;
    metric_type: string;
    provenance: unknown;
    source: string | null;
    unit: string;
    value: number;
  }>,
  expected: Awaited<ReturnType<typeof prepareFinalOnboardingProfile>>,
) {
  const canonicalize = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
        .join(",")}}`;
    }
    return JSON.stringify(value) ?? "undefined";
  };
  const normalize = (metric: {
    calculation_version?: string | null;
    calculationVersion?: string;
    method: string | null;
    metric_type: string;
    observationSource?: string;
    provenance: unknown;
    source?: string | null;
    unit: string;
    value: number;
  }) =>
    canonicalize({
      calculationVersion: metric.calculationVersion ?? metric.calculation_version,
      method: metric.method,
      metricType: metric.metric_type,
      observationSource: metric.observationSource ?? metric.source,
      provenance: metric.provenance,
      unit: metric.unit,
      value: metric.value,
    });
  return (
    persisted.length === expected.length &&
    persisted.map(normalize).sort().join("|") === expected.map(normalize).sort().join("|")
  );
}
