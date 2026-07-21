import { calculateAgeFromDOB, getBaselineProfile } from "@repo/core";
import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import type { getRequiredDb } from "../../db";
import {
  lockOnboardingProfile,
  OnboardingProfileNotFoundForLockError,
  readOnboardingProfileState,
} from "../../repositories/onboarding-lifecycle-repository";
import { batchInsertProfileMetrics, prepareProfileMetrics } from "../../utils/onboarding-helpers";
import { OnboardingProviderEnrichmentService } from "../onboarding-provider-enrichment";
import {
  OnboardingProfileNotFoundError,
  persistOnboardingProfile,
} from "./persist-onboarding-profile";

type Db = ReturnType<typeof getRequiredDb>;

export type RequiredOnboardingResult = {
  status: "completed" | "already_completed";
  success: true;
  created: { profile_metrics: number; activity_efforts: number };
  baseline_used: boolean;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

export class OnboardingProviderPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingProviderPreconditionError";
  }
}

export class OnboardingRequiredWriteError extends Error {
  constructor(
    public readonly stage: "profile" | "metrics" | "efforts",
    options?: { cause?: unknown },
  ) {
    super(`Failed onboarding ${stage} write`, options);
    this.name = "OnboardingRequiredWriteError";
  }
}

function alreadyCompletedResult(): RequiredOnboardingResult {
  return {
    status: "already_completed",
    success: true,
    created: { profile_metrics: 0, activity_efforts: 0 },
    baseline_used: false,
    confidence: "high",
    warnings: [],
  };
}

export async function completeRequiredOnboarding(input: {
  db: Db;
  profileId: string;
  data: CompleteOnboarding;
}): Promise<RequiredOnboardingResult> {
  const initialProfile = await readOnboardingProfileState(input.db, input.profileId);
  if (!initialProfile) throw new OnboardingProfileNotFoundForLockError();
  if (initialProfile.onboarded) return alreadyCompletedResult();

  const providerEnrichment = new OnboardingProviderEnrichmentService({ db: input.db });
  try {
    await providerEnrichment.assertCanComplete(input.profileId);
  } catch (error) {
    const recheckedProfile = await readOnboardingProfileState(input.db, input.profileId);
    if (recheckedProfile?.onboarded) return alreadyCompletedResult();
    throw new OnboardingProviderPreconditionError(
      error instanceof Error ? error.message : "Provider enrichment is still required",
    );
  }

  const imported = await providerEnrichment.getImportedOnboardingValues(input.profileId);
  const fieldSources = input.data.baseline_field_sources;
  const effectiveDob = fieldSources?.dob === "cleared" ? undefined : input.data.dob;
  const effectiveGender = fieldSources?.gender === "cleared" ? undefined : input.data.gender;
  const effectiveWeight = fieldSources?.weight_kg === "cleared" ? undefined : input.data.weight_kg;
  const ageForBaseline = effectiveDob ? calculateAgeFromDOB(effectiveDob) : 30;
  const { experience_level } = input.data;
  const canGenerateBaseline =
    experience_level !== "skip" &&
    experience_level !== "advanced" &&
    effectiveWeight !== undefined &&
    effectiveGender !== undefined;
  const baseline = canGenerateBaseline
    ? getBaselineProfile(
        experience_level,
        effectiveWeight,
        effectiveGender,
        ageForBaseline,
        "other",
      )
    : null;
  const preserveImportedFields = new Set<
    | "weight_kg"
    | "max_hr"
    | "resting_hr"
    | "ftp"
    | "threshold_pace_seconds_per_km"
    | "css_seconds_per_hundred_meters"
  >();
  if (
    fieldSources?.weight_kg === "imported" &&
    input.data.weight_kg !== undefined &&
    input.data.weight_kg === imported.values.weight_kg
  ) {
    preserveImportedFields.add("weight_kg");
  }
  const importedProvenance = Object.fromEntries(
    Object.entries(imported.sources).map(([field, source]) => [
      field,
      {
        provider: source.provider,
        source_recorded_at: source.sourceRecordedAt,
      },
    ]),
  );
  const metrics = prepareProfileMetrics(
    {
      weight_kg: effectiveWeight,
      max_hr: input.data.max_hr,
      resting_hr: input.data.resting_hr,
      lthr: input.data.lthr,
      vo2max: input.data.vo2max,
      ftp: input.data.ftp,
      threshold_pace_seconds_per_km: input.data.threshold_pace_seconds_per_km,
      css_seconds_per_hundred_meters: input.data.css_seconds_per_hundred_meters,
    },
    baseline,
    { fieldSources, importedProvenance, preserveImportedFields },
  );
  let writeStage: "profile" | "metrics" = "profile";
  try {
    const status = await input.db.transaction(async (tx) => {
      const lockedProfile = await lockOnboardingProfile(tx, input.profileId);
      if (lockedProfile.onboarded) return "already_completed" as const;

      await persistOnboardingProfile({
        tx,
        profileId: input.profileId,
        input: { ...input.data, username: input.data.username.toLowerCase() },
      });
      writeStage = "metrics";
      await batchInsertProfileMetrics(tx, input.profileId, metrics);
      return "completed" as const;
    });

    if (status === "already_completed") return alreadyCompletedResult();
  } catch (error) {
    if (
      error instanceof OnboardingProfileNotFoundError ||
      error instanceof OnboardingProfileNotFoundForLockError
    ) {
      throw error;
    }
    throw new OnboardingRequiredWriteError(writeStage, { cause: error });
  }

  return {
    status: "completed",
    success: true,
    created: { profile_metrics: metrics.length, activity_efforts: 0 },
    baseline_used: !!baseline,
    confidence: baseline?.confidence ?? "high",
    warnings: [],
  };
}
