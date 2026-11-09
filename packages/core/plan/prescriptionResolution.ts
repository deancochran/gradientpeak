import { z } from "zod";
import {
  activityPlanStructureSchema,
  activityPlanTrainingIntentSchema,
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
/** V4 activity-plan semantic identity includes its fixed training intent. */
export const activityPlanSemanticHashSchema = z.string().regex(/^v2:sha256:[0-9a-f]{64}$/);
const weekdaySchema = z.number().int().min(0).max(6);
const finiteNonnegativeSchema = z.number().finite().min(0);
const NO_CONTEXT_CALCULATION_AS_OF = "1970-01-01T00:00:00.000Z";

/** V4 plans are fixed documents; this policy deliberately has no adaptation surface. */
export const DEFAULT_TRAINING_PLAN_POLICY_V2 = {
  version: "training-plan-policy-v2",
  resolver_version: "prescription-resolver-v2",
  preference_defaults: {
    weekly_session_count: 3,
    target_weekly_duration_minutes: 180,
    maximum_session_duration_minutes: 90,
    preferred_weekdays: [] as number[],
    rest_days: [] as number[],
    progression_style: "balanced" as const,
    recovery_priority: "balanced" as const,
  },
  limits: { candidates: 1000 },
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

export function resolveTrainingPlanPreferences(input: unknown): EffectiveTrainingPlanPreferences {
  const preferences = trainingPlanPreferencesSchema.parse(input);
  const defaults = DEFAULT_TRAINING_PLAN_POLICY_V2.preference_defaults;
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
    semantic_hash: activityPlanSemanticHashSchema,
    activity_category: canonicalActivityCategorySchema,
    training_intent: activityPlanTrainingIntentSchema,
    structure: activityPlanStructureSchema,
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.activity_category !== candidate.structure.activity_category)
      context.addIssue({
        code: "custom",
        path: ["structure", "activity_category"],
        message: "Candidate and structure categories must match.",
      });
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
  "hard_duration_exceeded",
  "unsupported_duration",
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
    if ((estimate.duration.status === "unavailable") !== (estimate.duration.value_seconds === null))
      context.addIssue({
        code: "custom",
        path: ["duration", "value_seconds"],
        message: "Duration availability and value must agree.",
      });
    if ((estimate.common_load.status === "unavailable") !== (estimate.common_load.value === null))
      context.addIssue({
        code: "custom",
        path: ["common_load", "value"],
        message: "Common Load availability and value must agree.",
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
    resolver_version: z.literal(DEFAULT_TRAINING_PLAN_POLICY_V2.resolver_version),
    policy_version: z.literal(DEFAULT_TRAINING_PLAN_POLICY_V2.version),
    training_plan_id: z.string().uuid().nullable(),
    training_plan_revision: z.number().int().positive().nullable(),
    training_plan_hash: canonicalSemanticHashSchema.nullable(),
    athlete_context_revision: z.number().int().positive().nullable(),
    activity_plan_id: z.string().uuid(),
    activity_plan_revision: z.number().int().positive(),
    activity_plan_semantic_hash: activityPlanSemanticHashSchema,
    session_demand: sessionDemandSchema,
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
    if (
      !provenanceSchema.safeParse({
        training_plan_id: manifest.training_plan_id,
        training_plan_revision: manifest.training_plan_revision,
        training_plan_hash: manifest.training_plan_hash,
      }).success
    )
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
    if (manifest.resolved_structure_hash !== structureHash(manifest.resolved_structure))
      context.addIssue({
        code: "custom",
        path: ["resolved_structure_hash"],
        message: "Resolved structure hash mismatch.",
      });
    if (
      (manifest.fallback_level === "evidence_informed") !==
      (manifest.athlete_context_revision !== null)
    )
      context.addIssue({
        code: "custom",
        path: ["athlete_context_revision"],
        message: "Context revision must match evidence-informed resolution.",
      });
    if ((manifest.fallback_level === "evidence_informed") !== manifest.evidence_facts.length > 0)
      context.addIssue({
        code: "custom",
        path: ["evidence_facts"],
        message: "Evidence facts must match evidence-informed resolution.",
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
      .max(DEFAULT_TRAINING_PLAN_POLICY_V2.limits.candidates + 1),
    provenance: provenanceSchema.optional(),
  })
  .strict();
export type ResolvePrescriptionInput = z.input<typeof resolvePrescriptionInputSchema>;

function structureHash(structure: unknown) {
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
  for (const item of structure.items)
    for (const step of item.type === "step" ? [item] : item.steps) {
      if (step.duration.type !== "time") return null;
      total += step.duration.seconds * (item.type === "repeat" ? item.count : 1);
    }
  return total;
}
function hasDuration(
  structure: ImmutableActivityPlanRevision["structure"],
  type: "distance" | "repetitions",
) {
  return structure.items.some((item) =>
    (item.type === "step" ? [item] : item.steps).some((step) => step.duration.type === type),
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
  return (
    hasTarget(targets, "RPE") ||
    (type === "watts"
      ? hasTarget(targets, "%FTP")
      : type === "bpm"
        ? hasTarget(targets, "%ThresholdHR") || hasTarget(targets, "%MaxHR")
        : false)
  );
}
function eachStep(
  structure: ImmutableActivityPlanRevision["structure"],
  visit: (targets: readonly { type: string }[]) => void,
) {
  for (const item of structure.items)
    for (const step of item.type === "step" ? [item] : item.steps) visit(step.targets);
}
function hasRequiredAbsoluteEvidence(structure: ImmutableActivityPlanRevision["structure"]) {
  let required = false;
  eachStep(structure, (targets) => {
    required ||=
      (hasTarget(targets, "watts") && !absoluteHasAlternative(targets, "watts")) ||
      (hasTarget(targets, "bpm") && !absoluteHasAlternative(targets, "bpm"));
  });
  return required;
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
  // Common-load estimation uses threshold heart rate even when the authored
  // target is expressed as a percentage of maximum heart rate.  Preserve both
  // independently fresh facts rather than discarding LTHR at this boundary.
  const copyHeartRateContext = () => {
    const lthr = copyHeartRate("lthr");
    const maxHr = copyHeartRate("maxHr");
    return lthr || maxHr;
  };
  eachStep(structure, (targets) => {
    if (hasTarget(targets, "%FTP")) copyPower();
    if (hasTarget(targets, "%ThresholdHR") || hasTarget(targets, "%MaxHR")) copyHeartRateContext();
    if (hasTarget(targets, "watts") && !absoluteHasAlternative(targets, "watts") && !copyPower())
      missing = true;
    if (
      hasTarget(targets, "bpm") &&
      !absoluteHasAlternative(targets, "bpm") &&
      !copyHeartRate("lthr")
    )
      missing = true;
    if (hasTarget(targets, "speed")) copySpeed();
  });
  return { facts, used, missing };
}
function compactEvidenceFacts(
  facts: ReturnType<typeof createUnavailableAthletePerformanceTargetFacts>,
) {
  const result: z.output<typeof prescriptionEvidenceFactSchema>[] = [];
  for (const activity_category of ["bike", "run", "swim"] as const) {
    const threshold = facts.thresholds[activity_category];
    if (threshold.status === "available")
      result.push({
        kind: "threshold",
        activity_category,
        metric: threshold.metric,
        unit: threshold.unit,
        value: threshold.value,
        observed_at: threshold.effectiveAt,
        source_id: threshold.thresholdId,
        policy_version: threshold.policyVersion,
      });
    for (const metric of ["lthr", "maxHr"] as const) {
      const heartRate = facts.heartRate[activity_category][metric];
      if (heartRate.status === "available")
        result.push({
          kind: "heart_rate",
          activity_category,
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
      value: common.status === "unavailable" ? null : common.load,
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
    stringifyCanonicalJson(DEFAULT_TRAINING_PLAN_POLICY_V2.preference_defaults)
  );
}
function structureIntensityScore(structure: ImmutableActivityPlanRevision["structure"]) {
  let score = 0;
  for (const item of structure.items)
    for (const step of item.type === "step" ? [item] : item.steps)
      for (const target of step.targets) {
        if (target.type === "rest") continue;
        const definition = activityTargetDefinitionByType[target.type];
        score +=
          ((target.intensity - definition.minimum) /
            Math.max(definition.saveableMaximum - definition.minimum, 1)) *
          (item.type === "repeat" ? item.count : 1);
      }
  return score;
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
function objectiveScore(
  input: { duration_seconds: number | null },
  estimate: PrescriptionEstimate | null,
  demand: z.output<typeof sessionDemandSchema>,
  targetSeconds: number,
) {
  const importanceWeight =
    demand.importance === "key" ? 1.5 : demand.importance === "support" ? 0.75 : 1;
  const duration = input.duration_seconds ?? 0;
  const durationError =
    (Math.abs(duration - targetSeconds) / Math.max(targetSeconds, 1)) *
    (duration < targetSeconds ? importanceWeight : 1);
  if (demand.target_common_load === null) return durationError;
  if (estimate?.common_load.value === null || estimate === null) return Number.POSITIVE_INFINITY;
  return (
    durationError +
    (Math.abs(estimate.common_load.value - demand.target_common_load) /
      Math.max(demand.target_common_load, 1)) *
      (estimate.common_load.value < demand.target_common_load ? importanceWeight : 1)
  );
}

/** Deterministically selects and validates one fixed V4 prescription; it never rewrites authored structure. */
export function resolvePrescription(input: ResolvePrescriptionInput): PrescriptionResolutionResult {
  const parsed = resolvePrescriptionInputSchema.parse(input);
  const baseline =
    parsed.baseline.status === "no_context"
      ? { ...parsed.baseline, as_of: NO_CONTEXT_CALCULATION_AS_OF }
      : parsed.baseline;
  if (parsed.candidates.length > DEFAULT_TRAINING_PLAN_POLICY_V2.limits.candidates)
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
  const ids = new Set<string>();
  for (const candidate of parsed.candidates) {
    if (ids.has(candidate.id))
      return unsupported("duplicate_candidate_id", "Candidate IDs must be unique.");
    ids.add(candidate.id);
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
  const maximumSeconds = preferences.maximum_session_duration_minutes * 60;
  const targetSeconds = targetDurationMinutes(parsed.demand, preferences) * 60;
  const eligible = pool.flatMap((candidate) => {
    if (
      validateActivityPlanIntent({
        intent: { training_intent: candidate.training_intent },
        structure: candidate.structure,
      }).status !== "compatible"
    )
      return [];
    const authoredDuration = durationSeconds(candidate.structure);
    if (authoredDuration !== null && authoredDuration > maximumSeconds) return [];
    const evidence = freshEvidenceForObjective(candidate.structure, baseline);
    return evidence.missing ? [] : [{ candidate, authoredDuration, evidence }];
  });
  if (
    eligible.length === 0 &&
    pool.some((candidate) => freshEvidenceForObjective(candidate.structure, baseline).missing)
  )
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
  if (eligible.length === 0)
    return unsupported(
      "hard_duration_exceeded",
      "No exact candidate can resolve within the maximum session duration hard constraint.",
    );
  const asOf = baseline.status === "available" ? baseline.context.evidence.asOf : baseline.as_of;
  const evaluated = eligible
    .map((item) => {
      const estimate =
        item.authoredDuration === null || parsed.demand.target_common_load !== null
          ? compactEstimate(
              estimateActivityPlanForTrainingContext({
                structure: item.candidate.structure,
                performanceTargets: item.evidence.facts,
                asOf,
                planId: item.candidate.id,
                stage: "plan",
              }),
            )
          : null;
      const duration = item.authoredDuration ?? estimate?.duration.value_seconds ?? null;
      return {
        ...item,
        estimate,
        duration,
        objective: objectiveScore(
          { duration_seconds: duration },
          estimate,
          parsed.demand,
          targetSeconds,
        ),
        intensity: structureIntensityScore(item.candidate.structure),
      };
    })
    .filter((item) => item.duration !== null && item.duration <= maximumSeconds);
  if (evaluated.length === 0) {
    if (
      pool.some(
        (candidate) =>
          hasDuration(candidate.structure, "repetitions") &&
          candidate.structure.activity_category !== "strength",
      )
    )
      return unsupported(
        "unsupported_duration",
        "Non-strength repetition prescriptions require an explicit duration policy.",
      );
    if (pool.some((candidate) => hasDuration(candidate.structure, "distance")))
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
  const selected = [...evaluated].sort(
    (left, right) =>
      left.objective - right.objective ||
      (left.estimate?.common_load.value ?? Infinity) -
        (right.estimate?.common_load.value ?? Infinity) ||
      left.intensity - right.intensity ||
      left.candidate.semantic_hash.localeCompare(right.candidate.semantic_hash) ||
      left.candidate.id.localeCompare(right.candidate.id) ||
      left.candidate.revision - right.candidate.revision,
  )[0];
  if (!selected) return unsupported("missing_exact_coverage");
  const estimate =
    selected.estimate ??
    compactEstimate(
      estimateActivityPlanForTrainingContext({
        structure: selected.candidate.structure,
        performanceTargets: selected.evidence.facts,
        asOf,
        planId: selected.candidate.id,
        stage: "plan",
      }),
    );
  const fallback_level = selected.evidence.used
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
  const resolved_structure_hash = structureHash(selected.candidate.structure);
  const evidence_facts = compactEvidenceFacts(selected.evidence.facts);
  const fingerprint = `v1:sha256:${sha256Hex(stringifyCanonicalJson({ resolver_version: DEFAULT_TRAINING_PLAN_POLICY_V2.resolver_version, policy_version: DEFAULT_TRAINING_PLAN_POLICY_V2.version, preferences, planning_weekday: parsed.planning_weekday ?? null, demand: parsed.demand, provenance, candidate: { id: selected.candidate.id, revision: selected.candidate.revision, semantic_hash: selected.candidate.semantic_hash, structure_hash: resolved_structure_hash }, resolved_structure_hash, effective_evidence: { revision: baseline.status === "available" ? baseline.revision : null, facts: evidence_facts }, estimate }))}`;
  return {
    status: "resolved",
    manifest: prescriptionResolutionManifestSchema.parse({
      resolver_version: DEFAULT_TRAINING_PLAN_POLICY_V2.resolver_version,
      policy_version: DEFAULT_TRAINING_PLAN_POLICY_V2.version,
      ...provenance,
      athlete_context_revision:
        selected.evidence.used && baseline.status === "available" ? baseline.revision : null,
      activity_plan_id: selected.candidate.id,
      activity_plan_revision: selected.candidate.revision,
      activity_plan_semantic_hash: selected.candidate.semantic_hash,
      session_demand: parsed.demand,
      effective_target_duration_minutes: targetSeconds / 60,
      effective_target_common_load: parsed.demand.target_common_load,
      evidence_facts,
      fallback_level,
      reason_codes,
      resolved_structure: selected.candidate.structure,
      resolved_structure_hash,
      prescription_estimate: estimate,
      fingerprint,
    }),
  };
}
