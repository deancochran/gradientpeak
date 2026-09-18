import { activityPlanStructureSchema } from "../activity-plan";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import type { SystemActivityPlanTemplate } from "./types";

export const ACTIVITY_PLAN_INTENSITY_BANDS = [
  "recovery",
  "endurance",
  "tempo",
  "threshold",
  "vo2max",
  "anaerobic",
  "neuromuscular",
] as const;

export type ActivityPlanIntensityBand = (typeof ACTIVITY_PLAN_INTENSITY_BANDS)[number];
export type ActivityPlanDifficulty = "foundation" | "development" | "advanced" | "race-specific";
export type ActivityPlanDurationClass = "short" | "medium" | "long";

export type ActivityPlanPortfolioMetadata = {
  difficulty: ActivityPlanDifficulty;
  durationClass: ActivityPlanDurationClass;
  family: string;
  primaryIntensity: ActivityPlanIntensityBand;
  primaryPurpose: string;
  templateId: string;
  triathlonContext: boolean;
};

export const ACTIVITY_PLAN_PORTFOLIO_MAX_SIZE = 200;
export const ACTIVITY_PLAN_PORTFOLIO_VOLUME_SATURATION = 180;
export const ACTIVITY_PLAN_PORTFOLIO_CATEGORY_TARGETS = {
  bike: 50,
  other: 30,
  run: 50,
  strength: 25,
  swim: 45,
} as const satisfies Record<CanonicalActivityCategory, number>;

export const ACTIVITY_PLAN_PORTFOLIO_ENDURANCE_INTENSITY_TARGETS = {
  bike: {
    recovery: 5,
    endurance: 14,
    tempo: 8,
    threshold: 9,
    vo2max: 7,
    anaerobic: 4,
    neuromuscular: 3,
  },
  run: {
    recovery: 5,
    endurance: 14,
    tempo: 8,
    threshold: 9,
    vo2max: 7,
    anaerobic: 4,
    neuromuscular: 3,
  },
  swim: {
    recovery: 4,
    endurance: 12,
    tempo: 7,
    threshold: 8,
    vo2max: 6,
    anaerobic: 4,
    neuromuscular: 4,
  },
} as const satisfies Record<"bike" | "run" | "swim", Record<ActivityPlanIntensityBand, number>>;

export type ActivityPlanPortfolioReport = {
  categoryCoverage: number;
  categoryCounts: Record<CanonicalActivityCategory, number>;
  duplicateIds: readonly string[];
  duplicateNames: readonly string[];
  exactSemanticDuplicates: readonly string[][];
  intensityCoverage: number;
  intensityCounts: Record<"bike" | "run" | "swim", Record<ActivityPlanIntensityBand, number>>;
  metadataCoverage: number;
  metadataMismatches: readonly string[];
  objectiveScore: number;
  size: number;
  triathlonPlanCount: number;
  validStructureCount: number;
  volumeScore: number;
};

function duplicates(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value);
}

function semanticFingerprint(template: SystemActivityPlanTemplate): string {
  return JSON.stringify(template.structure, (key, value) => {
    if (key === "id" || key === "name" || key === "description" || key === "notes")
      return undefined;
    return value;
  });
}

function targetFulfillment(actual: number, target: number): number {
  return Math.min(actual / target, 1);
}

type ParsedActivityPlan = ReturnType<typeof activityPlanStructureSchema.parse>;

function activitySteps(structure: ParsedActivityPlan) {
  return structure.segments.flatMap((segment) =>
    segment.role === "activity"
      ? segment.intervals.flatMap((interval) =>
          interval.steps.map((step) => ({ repetitions: interval.repetitions, step })),
        )
      : [],
  );
}

function inferDurationClass(structure: ParsedActivityPlan): ActivityPlanDurationClass {
  const steps = activitySteps(structure);
  const meters = steps.reduce(
    (total, { repetitions, step }) =>
      total + (step.duration.type === "distance" ? step.duration.meters * repetitions : 0),
    0,
  );
  if (structure.activity_category === "swim" && meters > 0) {
    if (meters <= 1_500) return "short";
    if (meters <= 3_000) return "medium";
    return "long";
  }
  if (structure.activity_category === "run" && meters > 0) {
    if (meters < 10_000) return "short";
    if (meters < 25_000) return "medium";
    return "long";
  }
  const seconds = steps.reduce(
    (total, { repetitions, step }) =>
      total + (step.duration.type === "time" ? step.duration.seconds * repetitions : 0),
    0,
  );
  if (seconds <= 3_600) return "short";
  if (seconds <= 7_200) return "medium";
  return "long";
}

function inferPrimaryIntensity(structure: ParsedActivityPlan): ActivityPlanIntensityBand | null {
  const workSteps = activitySteps(structure).filter(
    ({ step }) => !/^(warmup|cooldown|recovery|rest)$/i.test(step.name),
  );
  const candidates = workSteps.flatMap(({ step }) =>
    step.targets.flatMap((target) =>
      "intensity" in target && typeof target.intensity === "number"
        ? [{ duration: step.duration, intensity: target.intensity, type: target.type }]
        : [],
    ),
  );
  const primary = candidates.sort((left, right) => right.intensity - left.intensity)[0];
  if (!primary) return null;
  if (primary.type === "RPE") {
    if (primary.intensity <= 3) return "recovery";
    if (primary.intensity <= 5) return "endurance";
    if (primary.intensity === 6) return "tempo";
    if (primary.intensity === 7) return "threshold";
    if (primary.intensity === 8) return "vo2max";
    const isBrief =
      (primary.duration.type === "time" && primary.duration.seconds <= 30) ||
      (primary.duration.type === "distance" && primary.duration.meters <= 25);
    return isBrief ? "neuromuscular" : "anaerobic";
  }
  if (primary.type === "%FTP") {
    if (primary.intensity <= 55) return "recovery";
    if (primary.intensity <= 75) return "endurance";
    if (primary.intensity <= 85) return "tempo";
    if (primary.intensity <= 97) return "threshold";
    if (primary.intensity <= 107) return "vo2max";
    return primary.duration.type === "time" && primary.duration.seconds <= 30
      ? "neuromuscular"
      : "anaerobic";
  }
  if (primary.type === "%MaxHR") {
    if (primary.intensity <= 60) return "recovery";
    if (primary.intensity <= 75) return "endurance";
    if (primary.intensity <= 85) return "tempo";
    if (primary.intensity <= 89) return "threshold";
    return "vo2max";
  }
  return null;
}

function hasTriathlonEvidence(
  template: SystemActivityPlanTemplate,
  category: CanonicalActivityCategory,
): boolean {
  const description = template.description?.toLowerCase() ?? "";
  if (!description.includes("triathlon")) return false;
  if (category === "bike") return description.includes("bike-leg");
  if (category === "run") return description.includes("run-leg");
  if (category === "swim") return description.includes("open-water");
  return false;
}

export function evaluateActivityPlanPortfolio(
  templates: readonly SystemActivityPlanTemplate[],
  metadata: readonly ActivityPlanPortfolioMetadata[],
): ActivityPlanPortfolioReport {
  const metadataById = new Map(metadata.map((entry) => [entry.templateId, entry]));
  const categoryCounts = { bike: 0, other: 0, run: 0, strength: 0, swim: 0 };
  const intensityCounts = {
    bike: {
      recovery: 0,
      endurance: 0,
      tempo: 0,
      threshold: 0,
      vo2max: 0,
      anaerobic: 0,
      neuromuscular: 0,
    },
    run: {
      recovery: 0,
      endurance: 0,
      tempo: 0,
      threshold: 0,
      vo2max: 0,
      anaerobic: 0,
      neuromuscular: 0,
    },
    swim: {
      recovery: 0,
      endurance: 0,
      tempo: 0,
      threshold: 0,
      vo2max: 0,
      anaerobic: 0,
      neuromuscular: 0,
    },
  } satisfies Record<"bike" | "run" | "swim", Record<ActivityPlanIntensityBand, number>>;
  let validStructureCount = 0;
  let triathlonPlanCount = 0;
  let matchedMetadataCount = 0;
  const metadataMismatches: string[] = [];

  const fingerprints = new Map<string, string[]>();
  for (const template of templates) {
    const parsed = activityPlanStructureSchema.safeParse(template.structure);
    if (parsed.success) {
      validStructureCount += 1;
      categoryCounts[parsed.data.activity_category] += 1;
    }
    const templateMetadata = template.id ? metadataById.get(template.id) : undefined;
    if (templateMetadata) matchedMetadataCount += 1;
    if (templateMetadata?.triathlonContext) triathlonPlanCount += 1;
    if (
      templateMetadata &&
      templateMetadata.primaryIntensity in intensityCounts.bike &&
      templateMetadata.templateId === template.id &&
      parsed.success &&
      (parsed.data.activity_category === "bike" ||
        parsed.data.activity_category === "run" ||
        parsed.data.activity_category === "swim")
    ) {
      intensityCounts[parsed.data.activity_category][templateMetadata.primaryIntensity] += 1;
    }
    if (templateMetadata && parsed.success) {
      const familyCategory = templateMetadata.family.split(":", 1)[0];
      if (familyCategory !== parsed.data.activity_category) {
        metadataMismatches.push(`${template.name}: family category`);
      }
      if (inferDurationClass(parsed.data) !== templateMetadata.durationClass) {
        metadataMismatches.push(`${template.name}: duration class`);
      }
      if (inferPrimaryIntensity(parsed.data) !== templateMetadata.primaryIntensity) {
        metadataMismatches.push(`${template.name}: primary intensity`);
      }
      if (
        templateMetadata.triathlonContext !==
        hasTriathlonEvidence(template, parsed.data.activity_category)
      ) {
        metadataMismatches.push(`${template.name}: triathlon context`);
      }
    }
    const fingerprint = semanticFingerprint(template);
    fingerprints.set(fingerprint, [...(fingerprints.get(fingerprint) ?? []), template.name]);
  }

  const categoryCoverage =
    Object.entries(ACTIVITY_PLAN_PORTFOLIO_CATEGORY_TARGETS).reduce(
      (total, [category, target]) =>
        total + targetFulfillment(categoryCounts[category as CanonicalActivityCategory], target),
      0,
    ) / 5;
  const intensityCoverage =
    (["bike", "run", "swim"] as const).reduce(
      (categoryTotal, category) =>
        categoryTotal +
        ACTIVITY_PLAN_INTENSITY_BANDS.reduce(
          (total, band) =>
            total +
            targetFulfillment(
              intensityCounts[category][band],
              ACTIVITY_PLAN_PORTFOLIO_ENDURANCE_INTENSITY_TARGETS[category][band],
            ),
          0,
        ) /
          ACTIVITY_PLAN_INTENSITY_BANDS.length,
      0,
    ) / 3;
  const qualityScore = templates.length === 0 ? 0 : validStructureCount / templates.length;
  const metadataCoverage = templates.length === 0 ? 0 : matchedMetadataCount / templates.length;
  const duplicateNames = duplicates(templates.map((template) => template.name));
  const exactSemanticDuplicates = [...fingerprints.values()].filter((names) => names.length > 1);
  const uniquenessScore =
    templates.length === 0
      ? 0
      : Math.max(
          0,
          1 -
            (duplicateNames.length +
              exactSemanticDuplicates.reduce((total, names) => total + names.length - 1, 0)) /
              templates.length,
        );
  const triathlonScore = Math.min(triathlonPlanCount / 60, 1);
  const volumeScore = Math.min(templates.length / ACTIVITY_PLAN_PORTFOLIO_VOLUME_SATURATION, 1);
  const coverageScore = categoryCoverage * 0.4 + intensityCoverage * 0.6;
  const objectiveScore =
    100 *
    (qualityScore * 0.3 +
      coverageScore * 0.25 +
      uniquenessScore * 0.15 +
      triathlonScore * 0.1 +
      metadataCoverage * 0.1 +
      volumeScore * 0.1);

  return {
    categoryCoverage,
    categoryCounts,
    duplicateIds: duplicates(templates.flatMap((template) => (template.id ? [template.id] : []))),
    duplicateNames,
    exactSemanticDuplicates,
    intensityCoverage,
    intensityCounts,
    metadataCoverage,
    metadataMismatches,
    objectiveScore,
    size: templates.length,
    triathlonPlanCount,
    validStructureCount,
    volumeScore,
  };
}
