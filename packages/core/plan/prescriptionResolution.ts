import { z } from "zod";
import {
  activityPlanAdaptationSchema,
  activityPlanStructureSchema,
  activityPlanTrainingIntentSchema,
  resolveActivityPlanStructure,
  validateActivityPlanIntent,
} from "../activity-plan";
import { stringifyCanonicalJson } from "../athlete-intelligence/canonical-json";
import { createUnavailableAthletePerformanceTargetFacts } from "../performance-model";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";
import {
  sessionDemandSchema,
  trainingPlanPreferencesSchema,
} from "../schemas/training-plan-structure";
import { activityTargetDefinitionByType } from "../targets/schema";
import { sha256Hex } from "../utils/sha256";
import { estimateActivityPlanForTrainingContext } from "./activity-plan-planning-estimate";
import { athletePlanningContextSchema } from "./athletePlanningContext";

/** Canonical semantic hash envelope shared by Core, API, clients, and persistence. */
export const canonicalSemanticHashSchema = z.string().regex(/^v1:sha256:[0-9a-f]{64}$/);
const weekdaySchema = z.number().int().min(0).max(6);
const finiteNonnegativeSchema = z.number().finite().min(0);
const NO_CONTEXT_CALCULATION_AS_OF = "1970-01-01T00:00:00.000Z";

export const DEFAULT_TRAINING_PLAN_POLICY_V1 = {
  version: "training-plan-policy-v1",
  resolver_version: "prescription-resolver-v1",
  preference_defaults: {
    weekly_session_count: 3,
    target_weekly_duration_minutes: 180,
    maximum_session_duration_minutes: 90,
    preferred_weekdays: [] as number[],
    rest_days: [] as number[],
    progression_style: "balanced" as const,
    recovery_priority: "balanced" as const,
  },
  limits: { candidates: 1000, adaptation_states: 10_000 },
} as const;

export const planningBaselineSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      context: athletePlanningContextSchema,
      revision: z.number().int().positive(),
    })
    .strict(),
  z.object({ status: z.literal("no_context"), as_of: z.string().datetime() }).strict(),
]);
export type PlanningBaseline = z.output<typeof planningBaselineSchema>;

export const effectiveTrainingPlanPreferencesSchema = z
  .object({
    weekly_session_count: z.number().int().min(1).max(14),
    target_weekly_duration_minutes: z.number().int().min(1).max(10_080),
    maximum_session_duration_minutes: z.number().int().min(1).max(600),
    preferred_weekdays: z.array(weekdaySchema).max(7),
    rest_days: z.array(weekdaySchema).max(7),
    progression_style: z.enum(["conservative", "balanced", "ambitious"]),
    recovery_priority: z.enum(["low", "balanced", "high"]),
  })
  .strict();
export type EffectiveTrainingPlanPreferences = z.output<
  typeof effectiveTrainingPlanPreferencesSchema
>;

/** Resolves nullable authored preferences into the policy's canonical effective form. */
export function resolveTrainingPlanPreferences(input: unknown): EffectiveTrainingPlanPreferences {
  const preferences = trainingPlanPreferencesSchema.parse(input);
  const defaults = DEFAULT_TRAINING_PLAN_POLICY_V1.preference_defaults;
  return effectiveTrainingPlanPreferencesSchema.parse({
    weekly_session_count: preferences.weekly_session_count ?? defaults.weekly_session_count,
    target_weekly_duration_minutes:
      preferences.target_weekly_duration_minutes ?? defaults.target_weekly_duration_minutes,
    maximum_session_duration_minutes:
      preferences.maximum_session_duration_minutes ?? defaults.maximum_session_duration_minutes,
    preferred_weekdays: [...preferences.preferred_weekdays].sort((a, b) => a - b),
    rest_days: [...preferences.rest_days].sort((a, b) => a - b),
    progression_style: preferences.progression_style ?? defaults.progression_style,
    recovery_priority: preferences.recovery_priority ?? defaults.recovery_priority,
  });
}

export const immutableActivityPlanRevisionSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    semantic_hash: canonicalSemanticHashSchema,
    activity_category: canonicalActivityCategorySchema,
    training_intent: activityPlanTrainingIntentSchema,
    structure: activityPlanStructureSchema,
    adaptation: activityPlanAdaptationSchema.nullable().optional(),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.activity_category !== candidate.structure.activity_category) {
      context.addIssue({
        code: "custom",
        path: ["structure", "activity_category"],
        message: "Candidate and structure categories must match.",
      });
    }
  });
export type ImmutableActivityPlanRevision = z.output<typeof immutableActivityPlanRevisionSchema>;

const provenanceSchema = z
  .object({
    training_plan_id: z.string().uuid().nullable(),
    training_plan_revision: z.number().int().positive().nullable(),
    training_plan_hash: canonicalSemanticHashSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const present = [
      value.training_plan_id,
      value.training_plan_revision,
      value.training_plan_hash,
    ].filter((item) => item !== null).length;
    if (present !== 0 && present !== 3)
      context.addIssue({
        code: "custom",
        message: "Training-plan provenance must be all present or all null.",
      });
  });

export const resolutionFailureCodeSchema = z.enum([
  "explicit_plan_missing",
  "explicit_plan_incompatible",
  "missing_exact_coverage",
  "duplicate_candidate_id",
  "candidate_limit_exceeded",
  "adaptation_surface_limit_exceeded",
  "hard_duration_exceeded",
  "unsupported_duration",
  "adaptation_invalid",
  "intent_incompatible",
]);
export const resolutionReasonCodeSchema = z.enum(["preferred_weekday"]);
export const missingPlanningInputCodeSchema = z.enum([
  "absolute_target_evidence",
  "common_load_estimate",
  "duration_estimate",
  "planning_weekday",
]);
export const missingPlanningInputSchema = z
  .object({
    code: missingPlanningInputCodeSchema,
    activity_category: canonicalActivityCategorySchema.nullable(),
    message: z.string().min(1).max(240),
  })
  .strict();
export const resolutionFailureSchema = z
  .object({ code: resolutionFailureCodeSchema, message: z.string().min(1).max(240) })
  .strict();
export const semanticAdaptationValuesSchema = z
  .record(z.string().min(1).max(64), z.number().finite())
  .refine((value) => Object.keys(value).length <= 32, "At most 32 adaptation values are allowed.");

export const prescriptionEstimateSchema = z
  .object({
    duration: z
      .object({
        status: z.enum(["exact", "estimated", "unavailable"]),
        value_seconds: z.number().int().positive().nullable(),
      })
      .strict(),
    common_load: z
      .object({
        status: z.enum(["complete", "partial", "unavailable"]),
        value: finiteNonnegativeSchema.nullable(),
      })
      .strict(),
    rest_seconds: z.number().int().nonnegative().max(86_400),
    has_open_completion: z.boolean(),
    warnings: z.array(z.string().min(1).max(240)).max(32),
    factors: z.array(z.string().min(1).max(160)).max(32),
  })
  .strict()
  .superRefine((estimate, context) => {
    if (estimate.duration.status === "unavailable" && estimate.duration.value_seconds !== null)
      context.addIssue({
        code: "custom",
        path: ["duration", "value_seconds"],
        message: "Unavailable duration cannot carry a value.",
      });
    if (estimate.duration.status !== "unavailable" && estimate.duration.value_seconds === null)
      context.addIssue({
        code: "custom",
        path: ["duration", "value_seconds"],
        message: "Available duration requires a value.",
      });
    if (estimate.common_load.status === "unavailable" && estimate.common_load.value !== null)
      context.addIssue({
        code: "custom",
        path: ["common_load", "value"],
        message: "Unavailable common load cannot carry a value.",
      });
    if (estimate.common_load.status !== "unavailable" && estimate.common_load.value === null)
      context.addIssue({
        code: "custom",
        path: ["common_load", "value"],
        message: "Available common load requires a value.",
      });
  });
export type PrescriptionEstimate = z.output<typeof prescriptionEstimateSchema>;

export const prescriptionEvidenceFactSchema = z
  .object({
    kind: z.enum(["threshold", "heart_rate"]),
    activity_category: z.enum(["bike", "run", "swim"]),
    metric: z.string().min(1).max(32),
    unit: z.string().min(1).max(64),
    value: z.number().finite().positive(),
    observed_at: z.string().datetime(),
    source_id: z.string().min(1).max(256),
    policy_version: z.string().min(1).max(128),
  })
  .strict();

export const prescriptionResolutionManifestSchema = z
  .object({
    resolver_version: z.string().min(1),
    policy_version: z.string().min(1),
    training_plan_id: z.string().uuid().nullable(),
    training_plan_revision: z.number().int().positive().nullable(),
    training_plan_hash: canonicalSemanticHashSchema.nullable(),
    athlete_context_revision: z.number().int().positive().nullable(),
    activity_plan_id: z.string().uuid(),
    activity_plan_revision: z.number().int().positive(),
    activity_plan_semantic_hash: canonicalSemanticHashSchema,
    session_demand: sessionDemandSchema,
    adaptation_values: semanticAdaptationValuesSchema,
    effective_target_duration_minutes: z.number().finite().positive().nullable(),
    effective_target_common_load: finiteNonnegativeSchema.nullable(),
    evidence_facts: z.array(prescriptionEvidenceFactSchema).max(16),
    fallback_level: z.enum([
      "evidence_informed",
      "preference_informed",
      "system_default_no_context",
    ]),
    reason_codes: z.array(resolutionReasonCodeSchema).max(8),
    resolved_structure: activityPlanStructureSchema,
    resolved_structure_hash: canonicalSemanticHashSchema,
    prescription_estimate: prescriptionEstimateSchema,
    fingerprint: canonicalSemanticHashSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const provenance = provenanceSchema.safeParse({
      training_plan_id: manifest.training_plan_id,
      training_plan_revision: manifest.training_plan_revision,
      training_plan_hash: manifest.training_plan_hash,
    });
    if (!provenance.success)
      context.addIssue({
        code: "custom",
        path: ["training_plan_id"],
        message: "Training-plan provenance must be all present or all null.",
      });
    if (manifest.session_demand.activity_category !== manifest.resolved_structure.activity_category)
      context.addIssue({
        code: "custom",
        path: ["resolved_structure", "activity_category"],
        message: "Demand category must match resolved structure category.",
      });
    const expectedHash = structureHash(manifest.resolved_structure);
    if (manifest.resolved_structure_hash !== expectedHash)
      context.addIssue({
        code: "custom",
        path: ["resolved_structure_hash"],
        message: "Resolved structure hash mismatch.",
      });
    if (
      manifest.fallback_level === "evidence_informed" &&
      manifest.athlete_context_revision === null
    )
      context.addIssue({
        code: "custom",
        path: ["athlete_context_revision"],
        message: "Evidence-informed resolutions require an athlete-context revision.",
      });
    if (
      manifest.fallback_level !== "evidence_informed" &&
      manifest.athlete_context_revision !== null
    )
      context.addIssue({
        code: "custom",
        path: ["athlete_context_revision"],
        message: "Non-evidence fallbacks cannot retain an athlete-context revision.",
      });
    if (manifest.fallback_level === "evidence_informed" && manifest.evidence_facts.length === 0)
      context.addIssue({
        code: "custom",
        path: ["evidence_facts"],
        message: "Evidence-informed resolutions require the facts that affected resolution.",
      });
    if (manifest.fallback_level !== "evidence_informed" && manifest.evidence_facts.length > 0)
      context.addIssue({
        code: "custom",
        path: ["evidence_facts"],
        message: "Fallback resolutions cannot retain unused athlete evidence.",
      });
  });
export type ResolutionManifest = z.output<typeof prescriptionResolutionManifestSchema>;
export type PrescriptionResolutionResult =
  | { status: "resolved"; manifest: ResolutionManifest }
  | { status: "needs_input"; missing: z.output<typeof missingPlanningInputSchema>[] }
  | { status: "unsupported"; reasons: z.output<typeof resolutionFailureSchema>[] };

export const resolvePrescriptionInputSchema = z
  .object({
    demand: sessionDemandSchema,
    activity_plan_id: z.string().uuid().nullable().optional(),
    preferences: trainingPlanPreferencesSchema,
    baseline: planningBaselineSchema,
    planning_weekday: weekdaySchema.nullable().optional(),
    candidates: z
      .array(immutableActivityPlanRevisionSchema)
      .max(DEFAULT_TRAINING_PLAN_POLICY_V1.limits.candidates + 1),
    provenance: provenanceSchema.optional(),
  })
  .strict();
export type ResolvePrescriptionInput = z.input<typeof resolvePrescriptionInputSchema>;

function structureHash(structure: unknown): string {
  return `v1:sha256:${sha256Hex(stringifyCanonicalJson(structure))}`;
}
function unsupported(
  code: z.output<typeof resolutionFailureCodeSchema>,
  message = code.replaceAll("_", " "),
): PrescriptionResolutionResult {
  return { status: "unsupported", reasons: [{ code, message }] };
}
function durationSeconds(structure: ImmutableActivityPlanRevision["structure"]): number | null {
  let total = 0;
  for (const segment of structure.segments) {
    if (segment.role === "rest") {
      total += segment.duration.seconds;
      continue;
    }
    for (const interval of segment.intervals)
      for (const step of interval.steps) {
        if (step.duration.type !== "time") return null;
        total += step.duration.seconds * interval.repetitions;
      }
  }
  return total;
}
function hasDistanceDuration(structure: ImmutableActivityPlanRevision["structure"]): boolean {
  return structure.segments.some(
    (segment) =>
      segment.role === "activity" &&
      segment.intervals.some((interval) =>
        interval.steps.some((step) => step.duration.type === "distance"),
      ),
  );
}
function hasUnsupportedRepetitionDuration(
  structure: ImmutableActivityPlanRevision["structure"],
): boolean {
  return (
    structure.activity_category !== "strength" &&
    structure.segments.some(
      (segment) =>
        segment.role === "activity" &&
        segment.intervals.some((interval) =>
          interval.steps.some((step) => step.duration.type === "repetitions"),
        ),
    )
  );
}
function targetDurationMinutes(
  demand: z.output<typeof sessionDemandSchema>,
  preferences: EffectiveTrainingPlanPreferences,
) {
  return (
    demand.target_duration_minutes ??
    preferences.target_weekly_duration_minutes / preferences.weekly_session_count
  );
}
type TargetType = "watts" | "bpm" | "speed" | "%FTP" | "%ThresholdHR" | "%MaxHR" | "RPE";

function hasTarget(targets: readonly { type: string }[], type: TargetType) {
  return targets.some((target) => target.type === type);
}
function absoluteHasAlternative(
  targets: readonly { type: string }[],
  type: "watts" | "bpm" | "speed",
) {
  if (hasTarget(targets, "RPE")) return true;
  if (type === "watts") return hasTarget(targets, "%FTP");
  if (type === "bpm") return hasTarget(targets, "%ThresholdHR") || hasTarget(targets, "%MaxHR");
  return false;
}
function freshEvidenceForObjective(
  structure: ImmutableActivityPlanRevision["structure"],
  baseline: z.output<typeof planningBaselineSchema>,
) {
  const asOf = baseline.status === "available" ? baseline.context.evidence.asOf : baseline.as_of;
  const facts = createUnavailableAthletePerformanceTargetFacts(asOf);
  if (baseline.status !== "available")
    return { facts, used: false, missing: hasRequiredAbsoluteEvidence(structure) };
  const source = baseline.context.performanceTargets;
  let used = false;
  let missing = false;

  const copyPower = () => {
    if (structure.activity_category !== "bike") return false;
    const fact = source.thresholds.bike;
    if (fact.status !== "available" || fact.freshness !== "fresh") return false;
    facts.thresholds.bike = fact;
    used = true;
    return true;
  };
  const copySpeed = () => {
    if (structure.activity_category !== "run" && structure.activity_category !== "swim")
      return false;
    const fact = source.thresholds[structure.activity_category];
    if (fact.status !== "available" || fact.freshness !== "fresh") return false;
    facts.thresholds[structure.activity_category] = fact;
    used = true;
    return true;
  };
  const copyHeartRate = (metric: "lthr" | "maxHr") => {
    if (
      structure.activity_category !== "bike" &&
      structure.activity_category !== "run" &&
      structure.activity_category !== "swim"
    )
      return false;
    const fact = source.heartRate[structure.activity_category][metric];
    if (fact.status !== "available" || fact.freshness !== "fresh") return false;
    facts.heartRate[structure.activity_category][metric] = fact;
    used = true;
    return true;
  };
  for (const segment of structure.segments)
    if (segment.role === "activity")
      for (const interval of segment.intervals)
        for (const step of interval.steps) {
          if (hasTarget(step.targets, "%FTP")) copyPower();
          if (hasTarget(step.targets, "%ThresholdHR")) copyHeartRate("lthr");
          if (hasTarget(step.targets, "%MaxHR")) copyHeartRate("maxHr");
          if (
            hasTarget(step.targets, "watts") &&
            !absoluteHasAlternative(step.targets, "watts") &&
            !copyPower()
          )
            missing = true;
          if (
            hasTarget(step.targets, "bpm") &&
            !absoluteHasAlternative(step.targets, "bpm") &&
            !copyHeartRate("lthr")
          )
            missing = true;
          if (hasTarget(step.targets, "speed")) copySpeed();
        }
  return { facts, used, missing };
}
function hasRequiredAbsoluteEvidence(structure: ImmutableActivityPlanRevision["structure"]) {
  return structure.segments.some(
    (segment) =>
      segment.role === "activity" &&
      segment.intervals.some((interval) =>
        interval.steps.some(
          (step) =>
            (hasTarget(step.targets, "watts") && !absoluteHasAlternative(step.targets, "watts")) ||
            (hasTarget(step.targets, "bpm") && !absoluteHasAlternative(step.targets, "bpm")),
        ),
      ),
  );
}

function compactEvidenceFacts(
  facts: ReturnType<typeof createUnavailableAthletePerformanceTargetFacts>,
) {
  const result: z.output<typeof prescriptionEvidenceFactSchema>[] = [];
  for (const activityCategory of ["bike", "run", "swim"] as const) {
    const threshold = facts.thresholds[activityCategory];
    if (threshold.status === "available")
      result.push({
        kind: "threshold",
        activity_category: activityCategory,
        metric: threshold.metric,
        unit: threshold.unit,
        value: threshold.value,
        observed_at: threshold.effectiveAt,
        source_id: threshold.thresholdId,
        policy_version: threshold.policyVersion,
      });
    for (const metric of ["lthr", "maxHr"] as const) {
      const heartRate = facts.heartRate[activityCategory][metric];
      if (heartRate.status === "available")
        result.push({
          kind: "heart_rate",
          activity_category: activityCategory,
          metric,
          unit: "beats_per_minute",
          value: heartRate.valueBpm,
          observed_at: heartRate.observedAt,
          source_id: heartRate.sourceEvidenceId,
          policy_version: heartRate.policyVersion,
        });
    }
  }
  return result;
}
type PreparedCandidate = {
  candidate: ImmutableActivityPlanRevision;
  adaptation_values: z.output<typeof semanticAdaptationValuesSchema>;
  structure: ImmutableActivityPlanRevision["structure"];
  authored_structure_hash: string;
  duration_seconds: number | null;
  target_distance_seconds: number;
};

function intentCanBeInvalidatedByStructure(
  trainingIntent: ImmutableActivityPlanRevision["training_intent"],
) {
  return [
    "recovery",
    "threshold_development",
    "vo2max",
    "anaerobic_capacity",
    "speed_skill",
    "technique",
  ].includes(trainingIntent);
}

function* adaptationStates(
  adaptation: ImmutableActivityPlanRevision["adaptation"],
): Generator<z.output<typeof semanticAdaptationValuesSchema>, void> {
  if (!adaptation) {
    yield {};
    return;
  }
  if (adaptation.allowedStates) {
    for (const state of adaptation.allowedStates)
      yield semanticAdaptationValuesSchema.parse(state.values);
    return;
  }
  const controls = adaptation.controls;
  function* visit(
    index: number,
    current: Record<string, number>,
  ): Generator<z.output<typeof semanticAdaptationValuesSchema>, void> {
    const control = controls[index];
    if (!control) {
      yield semanticAdaptationValuesSchema.parse({ ...current });
      return;
    }
    const count =
      Math.floor((control.range.maximum - control.range.minimum) / control.range.increment) + 1;
    for (let step = 0; step < count; step += 1) {
      const raw = control.range.minimum + step * control.range.increment;
      current[control.key] = Number.isInteger(raw) ? raw : Number(raw.toFixed(9));
      yield* visit(index + 1, current);
    }
    delete current[control.key];
  }
  yield* visit(0, {});
}

function adaptationStateCount(adaptation: ImmutableActivityPlanRevision["adaptation"]) {
  if (!adaptation) return 1;
  if (adaptation.allowedStates) return adaptation.allowedStates.length;
  let total = 1;
  for (const control of adaptation.controls) {
    const cardinality =
      Math.floor((control.range.maximum - control.range.minimum) / control.range.increment) + 1;
    total *= cardinality;
    if (
      !Number.isSafeInteger(total) ||
      total > DEFAULT_TRAINING_PLAN_POLICY_V1.limits.adaptation_states
    )
      return Number.POSITIVE_INFINITY;
  }
  return total;
}

function prepareCandidate(input: {
  candidate: ImmutableActivityPlanRevision;
  structure: ImmutableActivityPlanRevision["structure"];
  adaptation: ImmutableActivityPlanRevision["adaptation"];
  targetSeconds: number;
  maximumSeconds: number;
}): { candidates: PreparedCandidate[]; invalid: boolean } {
  let invalid = false;
  const candidates: PreparedCandidate[] = [];
  const authoredStructureHash = structureHash(input.structure);
  for (const adaptationValues of adaptationStates(input.adaptation)) {
    const resolution = resolveActivityPlanStructure({
      structure: input.structure,
      adaptation: input.adaptation,
      adaptation_values: adaptationValues,
    });
    if (resolution.status !== "resolved") {
      invalid = true;
      continue;
    }
    const duration = durationSeconds(resolution.structure);
    if (duration !== null && duration > input.maximumSeconds) continue;
    // The intent validator only rejects these intent variants; skipping its
    // invariant-compatible cases avoids re-deriving plan characteristics for
    // every state in a bounded adaptation surface.
    if (intentCanBeInvalidatedByStructure(input.candidate.training_intent)) {
      const intent = validateActivityPlanIntent({
        intent: { training_intent: input.candidate.training_intent },
        structure: resolution.structure,
      });
      if (intent.status !== "compatible") {
        invalid = true;
        continue;
      }
    }
    candidates.push({
      candidate: input.candidate,
      adaptation_values: adaptationValues,
      structure: resolution.structure,
      authored_structure_hash: authoredStructureHash,
      duration_seconds: duration,
      target_distance_seconds:
        duration === null ? Number.POSITIVE_INFINITY : Math.abs(duration - input.targetSeconds),
    });
  }
  return { candidates, invalid };
}
function compactEstimate(
  estimate: ReturnType<typeof estimateActivityPlanForTrainingContext>,
): PrescriptionEstimate {
  const common = estimate.prescriptionQuantification.summary.commonLoad;
  return prescriptionEstimateSchema.parse({
    duration: {
      status: estimate.durationEstimate.status,
      value_seconds: estimate.durationEstimate.valueSeconds,
    },
    common_load: {
      status: common.status,
      value: common.status !== "unavailable" ? common.load : null,
    },
    rest_seconds: estimate.restSeconds,
    has_open_completion: estimate.hasOpenCompletion,
    warnings: estimate.warnings,
    factors: estimate.factors,
  });
}
function preferencesAreDefault(preferences: EffectiveTrainingPlanPreferences) {
  return (
    stringifyCanonicalJson(preferences) ===
    stringifyCanonicalJson(DEFAULT_TRAINING_PLAN_POLICY_V1.preference_defaults)
  );
}

function adaptationPreferenceScore(
  prepared: PreparedCandidate,
  preferences: EffectiveTrainingPlanPreferences,
) {
  const controls = prepared.candidate.adaptation?.controls;
  if (!controls) return 0;
  let score = 0;
  for (const control of controls) {
    const value = prepared.adaptation_values[control.key] ?? control.range.default;
    const span = control.range.maximum - control.range.minimum;
    const normalized = span === 0 ? 0 : (value - control.range.minimum) / span;
    const defaultDistance = Math.abs(value - control.range.default) / (span || 1);
    if (control.kind === "recovery_quantity") {
      score +=
        preferences.recovery_priority === "high"
          ? -normalized
          : preferences.recovery_priority === "low"
            ? normalized
            : defaultDistance;
      continue;
    }
    if (control.kind === "target_intensity" && preferences.recovery_priority === "high") {
      score += normalized;
      continue;
    }
    score +=
      preferences.progression_style === "ambitious"
        ? -normalized
        : preferences.progression_style === "conservative"
          ? normalized
          : defaultDistance;
  }
  return score;
}

function structureIntensityScore(structure: ImmutableActivityPlanRevision["structure"]) {
  let score = 0;
  for (const segment of structure.segments) {
    if (segment.role !== "activity") continue;
    for (const interval of segment.intervals)
      for (const step of interval.steps)
        for (const target of step.targets) {
          const definition = activityTargetDefinitionByType[target.type];
          score +=
            (target.intensity - definition.minimum) /
            Math.max(definition.saveableMaximum - definition.minimum, 1);
        }
  }
  return score;
}

function objectiveScore(
  prepared: PreparedCandidate,
  estimate: PrescriptionEstimate | null,
  demand: z.output<typeof sessionDemandSchema>,
  targetSeconds: number,
) {
  const importanceWeight =
    demand.importance === "key" ? 1.5 : demand.importance === "support" ? 0.75 : 1;
  const durationShortfall = (prepared.duration_seconds ?? 0) < targetSeconds;
  const durationError =
    (prepared.target_distance_seconds / Math.max(targetSeconds, 1)) *
    (durationShortfall ? importanceWeight : 1);
  if (demand.target_common_load === null) return durationError;
  if (estimate?.common_load.value === null || estimate === null) return Number.POSITIVE_INFINITY;
  const loadShortfall = estimate.common_load.value < demand.target_common_load;
  const loadError =
    (Math.abs(estimate.common_load.value - demand.target_common_load) /
      Math.max(demand.target_common_load, 1)) *
    (loadShortfall ? importanceWeight : 1);
  return durationError + loadError;
}

/** The sole deterministic Core authority for selecting, adapting, validating, and estimating a prescription. */
export function resolvePrescription(input: ResolvePrescriptionInput): PrescriptionResolutionResult {
  const parsed = resolvePrescriptionInputSchema.parse(input);
  const baseline =
    parsed.baseline.status === "no_context"
      ? { ...parsed.baseline, as_of: NO_CONTEXT_CALCULATION_AS_OF }
      : parsed.baseline;
  if (parsed.candidates.length > DEFAULT_TRAINING_PLAN_POLICY_V1.limits.candidates)
    return unsupported(
      "candidate_limit_exceeded",
      "Candidate catalog exceeds the 1000-item resolver limit.",
    );
  const preferences = resolveTrainingPlanPreferences(parsed.preferences);
  const provenance = provenanceSchema.parse(
    parsed.provenance ?? {
      training_plan_id: null,
      training_plan_revision: null,
      training_plan_hash: null,
    },
  );
  const seen = new Set<string>();
  for (const candidate of parsed.candidates) {
    if (seen.has(candidate.id))
      return unsupported("duplicate_candidate_id", "Candidate IDs must be unique.");
    seen.add(candidate.id);
  }
  if (
    parsed.planning_weekday !== null &&
    parsed.planning_weekday !== undefined &&
    preferences.rest_days.includes(parsed.planning_weekday)
  )
    return {
      status: "needs_input",
      missing: [
        {
          code: "planning_weekday",
          activity_category: parsed.demand.activity_category,
          message: "Session falls on a configured rest day.",
        },
      ],
    };
  const exact = parsed.candidates.filter(
    (candidate) =>
      candidate.activity_category === parsed.demand.activity_category &&
      candidate.training_intent === parsed.demand.training_intent,
  );
  const pool = parsed.activity_plan_id
    ? parsed.candidates.filter((candidate) => candidate.id === parsed.activity_plan_id)
    : exact;
  if (parsed.activity_plan_id && pool.length === 0)
    return unsupported(
      "explicit_plan_missing",
      "The explicitly selected activity plan is unavailable.",
    );
  if (
    parsed.activity_plan_id &&
    pool[0] &&
    (pool[0].activity_category !== parsed.demand.activity_category ||
      pool[0].training_intent !== parsed.demand.training_intent)
  )
    return unsupported(
      "explicit_plan_incompatible",
      "The explicit plan does not exactly match category and intent.",
    );
  if (pool.length === 0)
    return unsupported(
      "missing_exact_coverage",
      "No candidate exactly matches the requested category and intent.",
    );
  const targetMinutes = targetDurationMinutes(parsed.demand, preferences);
  const maximumSeconds = preferences.maximum_session_duration_minutes * 60;
  const executableCandidates = pool.map((candidate) => ({
    candidate,
    structure: candidate.structure,
    adaptation: candidate.adaptation,
  }));
  let aggregateStateCount = 0;
  for (const candidate of executableCandidates) {
    aggregateStateCount += adaptationStateCount(candidate.adaptation);
    if (
      !Number.isSafeInteger(aggregateStateCount) ||
      aggregateStateCount > DEFAULT_TRAINING_PLAN_POLICY_V1.limits.adaptation_states
    )
      return unsupported(
        "adaptation_surface_limit_exceeded",
        "Executable adaptation domain exceeds the 10000-state resolver limit.",
      );
  }
  const preparation = executableCandidates.map((candidate) =>
    prepareCandidate({
      ...candidate,
      targetSeconds: targetMinutes * 60,
      maximumSeconds,
    }),
  );
  if (preparation.some((result) => result.invalid))
    return unsupported(
      "adaptation_invalid",
      "An activity-plan adaptation state is invalid or violates its training intent.",
    );
  const prepared = preparation.flatMap((result) => result.candidates);
  if (prepared.length === 0)
    return unsupported(
      "hard_duration_exceeded",
      "No exact candidate can resolve within the maximum session duration hard constraint.",
    );
  const asOf = baseline.status === "available" ? baseline.context.evidence.asOf : baseline.as_of;
  const evidenceByCandidate = new Map<
    ImmutableActivityPlanRevision,
    ReturnType<typeof freshEvidenceForObjective>
  >();
  const eligible = prepared.flatMap((candidate) => {
    let evidence = evidenceByCandidate.get(candidate.candidate);
    if (!evidence) {
      evidence = freshEvidenceForObjective(candidate.structure, baseline);
      evidenceByCandidate.set(candidate.candidate, evidence);
    }
    if (evidence.missing) return [];
    return [{ candidate, evidence }];
  });
  if (eligible.length === 0)
    return {
      status: "needs_input",
      missing: [
        {
          code: "absolute_target_evidence",
          activity_category: parsed.demand.activity_category,
          message:
            "A fresh category-relevant threshold or heart-rate fact is required for an absolute objective target.",
        },
      ],
    };
  const evaluatedBeforeDurationConstraint = eligible.map(({ candidate, evidence }) => {
    const estimate =
      candidate.duration_seconds === null || parsed.demand.target_common_load !== null
        ? compactEstimate(
            estimateActivityPlanForTrainingContext({
              structure: candidate.structure,
              performanceTargets: evidence.facts,
              asOf,
              planId: candidate.candidate.id,
              stage: "plan",
            }),
          )
        : null;
    const durationSeconds = candidate.duration_seconds ?? estimate?.duration.value_seconds ?? null;
    return {
      candidate: {
        ...candidate,
        duration_seconds: durationSeconds,
        target_distance_seconds:
          durationSeconds === null
            ? Number.POSITIVE_INFINITY
            : Math.abs(durationSeconds - targetMinutes * 60),
      },
      evidence,
      estimate,
    };
  });
  const evaluated = evaluatedBeforeDurationConstraint.filter(
    (item) =>
      item.candidate.duration_seconds !== null && item.candidate.duration_seconds <= maximumSeconds,
  );
  if (evaluated.length === 0) {
    if (
      evaluatedBeforeDurationConstraint.some(
        (item) =>
          item.candidate.duration_seconds === null &&
          hasUnsupportedRepetitionDuration(item.candidate.structure),
      )
    )
      return unsupported(
        "unsupported_duration",
        "Non-strength repetition prescriptions require an explicit duration policy.",
      );
    if (
      evaluatedBeforeDurationConstraint.some(
        (item) =>
          item.candidate.duration_seconds === null && hasDistanceDuration(item.candidate.structure),
      )
    )
      return {
        status: "needs_input",
        missing: [
          {
            code: "duration_estimate",
            activity_category: parsed.demand.activity_category,
            message:
              "A prescribed pace or speed, or matching athlete speed evidence, is required to estimate session duration.",
          },
        ],
      };
    return unsupported(
      "hard_duration_exceeded",
      "No exact candidate can resolve within the maximum session duration hard constraint.",
    );
  }
  if (
    parsed.demand.target_common_load !== null &&
    evaluated.every((item) => item.estimate?.common_load.value === null)
  )
    return {
      status: "needs_input",
      missing: [
        {
          code: "common_load_estimate",
          activity_category: parsed.demand.activity_category,
          message: "No candidate has enough evidence for the requested Common Load objective.",
        },
      ],
    };
  const ranked = evaluated.map((item) => ({
    ...item,
    objective_score: objectiveScore(
      item.candidate,
      item.estimate,
      parsed.demand,
      targetMinutes * 60,
    ),
    common_load_score: item.estimate?.common_load.value ?? Number.POSITIVE_INFINITY,
    intensity_score: structureIntensityScore(item.candidate.structure),
    adaptation_preference_score: adaptationPreferenceScore(item.candidate, preferences),
    adaptation_values_key: stringifyCanonicalJson(item.candidate.adaptation_values),
  }));
  const compareRankedCandidates = (
    left: (typeof ranked)[number],
    right: (typeof ranked)[number],
  ) => {
    const leftCandidate = left.candidate;
    const rightCandidate = right.candidate;
    return (
      left.objective_score - right.objective_score ||
      left.common_load_score - right.common_load_score ||
      left.intensity_score - right.intensity_score ||
      (leftCandidate.duration_seconds ?? Number.POSITIVE_INFINITY) -
        (rightCandidate.duration_seconds ?? Number.POSITIVE_INFINITY) ||
      left.adaptation_preference_score - right.adaptation_preference_score ||
      left.adaptation_values_key.localeCompare(right.adaptation_values_key) ||
      leftCandidate.candidate.semantic_hash.localeCompare(rightCandidate.candidate.semantic_hash) ||
      leftCandidate.candidate.id.localeCompare(rightCandidate.candidate.id) ||
      leftCandidate.candidate.revision - rightCandidate.candidate.revision
    );
  };
  let selectedEvaluation = ranked[0];
  for (const candidate of ranked.slice(1))
    if (selectedEvaluation && compareRankedCandidates(candidate, selectedEvaluation) < 0)
      selectedEvaluation = candidate;
  if (!selectedEvaluation) return unsupported("missing_exact_coverage");
  const { candidate: selected, evidence } = selectedEvaluation;
  const candidate = selected.candidate;
  const estimate =
    selectedEvaluation.estimate ??
    compactEstimate(
      estimateActivityPlanForTrainingContext({
        structure: selected.structure,
        performanceTargets: evidence.facts,
        asOf,
        planId: candidate.id,
        stage: "plan",
      }),
    );
  const fallback_level = evidence.used
    ? "evidence_informed"
    : baseline.status === "no_context" && preferencesAreDefault(preferences)
      ? "system_default_no_context"
      : "preference_informed";
  const reason_codes =
    parsed.planning_weekday !== null &&
    parsed.planning_weekday !== undefined &&
    preferences.preferred_weekdays.includes(parsed.planning_weekday)
      ? ["preferred_weekday" as const]
      : [];
  const resolved_structure_hash = structureHash(selected.structure);
  const effectiveEvidence = {
    // Evaluation time is request metadata, not evidence. The revision and facts
    // below retain changes that can alter the resolved prescription.
    revision: baseline.status === "available" ? baseline.revision : null,
    facts: compactEvidenceFacts(evidence.facts),
  };
  const fingerprint = `v1:sha256:${sha256Hex(stringifyCanonicalJson({ resolver_version: DEFAULT_TRAINING_PLAN_POLICY_V1.resolver_version, policy_version: DEFAULT_TRAINING_PLAN_POLICY_V1.version, preferences, planning_weekday: parsed.planning_weekday ?? null, demand: parsed.demand, provenance, candidate: { id: candidate.id, revision: candidate.revision, semantic_hash: candidate.semantic_hash, structure_hash: selected.authored_structure_hash }, adaptation_values: selected.adaptation_values, resolved_structure_hash, effective_evidence: effectiveEvidence, estimate }))}`;
  return {
    status: "resolved",
    manifest: prescriptionResolutionManifestSchema.parse({
      resolver_version: DEFAULT_TRAINING_PLAN_POLICY_V1.resolver_version,
      policy_version: DEFAULT_TRAINING_PLAN_POLICY_V1.version,
      ...provenance,
      athlete_context_revision:
        evidence.used && baseline.status === "available" ? baseline.revision : null,
      activity_plan_id: candidate.id,
      activity_plan_revision: candidate.revision,
      activity_plan_semantic_hash: candidate.semantic_hash,
      session_demand: parsed.demand,
      adaptation_values: selected.adaptation_values,
      effective_target_duration_minutes: targetMinutes,
      effective_target_common_load: parsed.demand.target_common_load,
      evidence_facts: compactEvidenceFacts(evidence.facts),
      fallback_level,
      reason_codes,
      resolved_structure: selected.structure,
      resolved_structure_hash,
      prescription_estimate: estimate,
      fingerprint,
    }),
  };
}
