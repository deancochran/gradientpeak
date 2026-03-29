import {
  buildSystemActivityTemplateCatalog,
  type NormalizedSystemActivityTemplateCatalogEntry,
} from "./activityTemplateCatalog";
import {
  COVERAGE_STATUS_THRESHOLD,
  FIRST_WAVE_COVERAGE_CELLS,
  type FirstWaveCoverageCellKey,
  type SystemActivityTemplateCoverageStatus,
} from "./systemActivityTemplateVerificationConfig";
import {
  analyzeTrainingPlanTemplateVariety,
  buildTrainingPlanTemplateDependencyMap,
} from "./trainingPlanTemplateVariety";

export interface SystemActivityTemplateCoverageTemplateRow
  extends NormalizedSystemActivityTemplateCatalogEntry {
  coverage_cell_key: FirstWaveCoverageCellKey | null;
  coverage_status: SystemActivityTemplateCoverageStatus | null;
  duplicate_risk: boolean;
  dependent_plan_names: string[];
  reuse_count: number;
}

export interface SystemActivityTemplateCoverageCellSummary {
  key: FirstWaveCoverageCellKey;
  sport: "run" | "bike";
  label: string;
  status: SystemActivityTemplateCoverageStatus;
  template_ids: string[];
  effective_template_count: number;
  duplicate_risk_template_ids: string[];
  dependent_plan_names: string[];
  reuse_count: number;
}

export interface SystemActivityTemplateCoverageMatrix {
  template_rows: SystemActivityTemplateCoverageTemplateRow[];
  cell_rows: SystemActivityTemplateCoverageCellSummary[];
  gap_rows: SystemActivityTemplateCoverageCellSummary[];
  first_wave_gate: {
    passes: boolean;
    blocking_cell_keys: FirstWaveCoverageCellKey[];
    blocking_plan_names: string[];
  };
}

type CoverageMatrixInputEntry = Pick<
  NormalizedSystemActivityTemplateCatalogEntry,
  | "template_id"
  | "sport"
  | "session_archetype"
  | "intensity_family"
  | "duration_seconds"
  | "primary_work_signature"
>;

export function resolveFirstWaveCoverageCellKey(
  entry: Pick<
    NormalizedSystemActivityTemplateCatalogEntry,
    "sport" | "session_archetype" | "intensity_family"
  >,
): FirstWaveCoverageCellKey | null {
  if (entry.sport === "run") {
    if (
      entry.session_archetype === "easy_recovery" ||
      entry.session_archetype === "aerobic_endurance"
    ) {
      return "run_easy_recovery";
    }
    if (entry.session_archetype === "tempo" || entry.session_archetype === "threshold") {
      return "run_tempo_threshold";
    }
    if (entry.session_archetype === "long_endurance") {
      return "run_long";
    }
    if (
      entry.session_archetype === "vo2_speed" ||
      entry.session_archetype === "race_pace" ||
      entry.intensity_family === "high_intensity" ||
      entry.intensity_family === "race_specific"
    ) {
      return "run_high_intensity_race_pace";
    }
  }

  if (entry.sport === "bike") {
    if (
      entry.session_archetype === "easy_recovery" ||
      entry.session_archetype === "aerobic_endurance"
    ) {
      return "bike_easy_recovery";
    }
    if (entry.session_archetype === "threshold" || entry.session_archetype === "sweet_spot") {
      return "bike_threshold_sweet_spot";
    }
    if (entry.session_archetype === "long_endurance") {
      return "bike_long_endurance";
    }
    if (
      entry.session_archetype === "anaerobic_power" ||
      entry.session_archetype === "climbing_muscular_endurance" ||
      entry.intensity_family === "high_intensity"
    ) {
      return "bike_high_intensity_climbing";
    }
  }

  return null;
}

export function findDuplicateRiskTemplateIds(
  entries: readonly CoverageMatrixInputEntry[],
): string[] {
  const duplicateRiskTemplateIds = new Set<string>();
  const groups = new Map<string, CoverageMatrixInputEntry[]>();

  for (const entry of entries) {
    const group = groups.get(entry.primary_work_signature) ?? [];
    group.push(entry);
    groups.set(entry.primary_work_signature, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    const durations = group.map((entry) => entry.duration_seconds);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    if (maxDuration - minDuration <= 600) {
      for (const entry of group) {
        duplicateRiskTemplateIds.add(entry.template_id);
      }
    }
  }

  return Array.from(duplicateRiskTemplateIds).sort();
}

export function buildCoverageCellSummaries(
  entries: readonly CoverageMatrixInputEntry[],
  options?: {
    dependencyPlanNamesByTemplateId?: ReadonlyMap<string, readonly string[]>;
    reuseCountByTemplateId?: ReadonlyMap<string, number>;
  },
): SystemActivityTemplateCoverageCellSummary[] {
  return FIRST_WAVE_COVERAGE_CELLS.map((cell) => {
    const cellEntries = entries.filter(
      (entry) => resolveFirstWaveCoverageCellKey(entry) === cell.key,
    );
    const duplicateRiskTemplateIds = findDuplicateRiskTemplateIds(cellEntries);
    const effectiveTemplateCount =
      duplicateRiskTemplateIds.length > 0
        ? Math.max(0, cellEntries.length - duplicateRiskTemplateIds.length + 1)
        : cellEntries.length;
    const status: SystemActivityTemplateCoverageStatus =
      duplicateRiskTemplateIds.length > 0
        ? "duplicate-risk"
        : effectiveTemplateCount <= COVERAGE_STATUS_THRESHOLD.missing
          ? "missing"
          : effectiveTemplateCount <= COVERAGE_STATUS_THRESHOLD.underCovered
            ? "under-covered"
            : "covered";
    const dependentPlanNames = Array.from(
      new Set(
        cellEntries.flatMap(
          (entry) => options?.dependencyPlanNamesByTemplateId?.get(entry.template_id) ?? [],
        ),
      ),
    ).sort();
    const reuseCount = cellEntries.reduce(
      (total, entry) => total + (options?.reuseCountByTemplateId?.get(entry.template_id) ?? 0),
      0,
    );

    return {
      key: cell.key,
      sport: cell.sport,
      label: cell.label,
      status,
      template_ids: cellEntries.map((entry) => entry.template_id).sort(),
      effective_template_count: effectiveTemplateCount,
      duplicate_risk_template_ids: duplicateRiskTemplateIds,
      dependent_plan_names: dependentPlanNames,
      reuse_count: reuseCount,
    };
  }).sort((left, right) => left.key.localeCompare(right.key));
}

export function buildSystemActivityTemplateCoverageMatrix(): SystemActivityTemplateCoverageMatrix {
  const catalog = buildSystemActivityTemplateCatalog();
  const dependencyMap = buildTrainingPlanTemplateDependencyMap();
  const dependencyPlanNamesByTemplateId = new Map(
    dependencyMap.map((entry) => [
      entry.template_id,
      entry.dependent_plans.map((plan) => plan.plan_name),
    ]),
  );
  const reuseCountByTemplateId = new Map(
    dependencyMap.map((entry) => [entry.template_id, entry.reuse_count]),
  );
  const cellRows = buildCoverageCellSummaries(catalog, {
    dependencyPlanNamesByTemplateId,
    reuseCountByTemplateId,
  });
  const cellStatusByKey = new Map(cellRows.map((row) => [row.key, row]));
  const duplicateRiskTemplateIdSet = new Set(
    cellRows.flatMap((row) => row.duplicate_risk_template_ids),
  );
  const templateRows = catalog.map((entry) => {
    const coverageCellKey = resolveFirstWaveCoverageCellKey(entry);
    const coverageCell = coverageCellKey ? cellStatusByKey.get(coverageCellKey) : null;

    return {
      ...entry,
      coverage_cell_key: coverageCellKey,
      coverage_status: coverageCell?.status ?? null,
      duplicate_risk: duplicateRiskTemplateIdSet.has(entry.template_id),
      dependent_plan_names:
        dependencyPlanNamesByTemplateId.get(entry.template_id)?.slice().sort() ?? [],
      reuse_count: reuseCountByTemplateId.get(entry.template_id) ?? 0,
    } satisfies SystemActivityTemplateCoverageTemplateRow;
  });
  const gapRows = cellRows.filter((row) => row.status !== "covered");
  const representativePlanAnalyses = analyzeTrainingPlanTemplateVariety().filter(
    (analysis) => analysis.gate_scope === "first-wave",
  );
  const blockingCellKeys = cellRows
    .filter((row) => row.status !== "covered")
    .map((row) => row.key)
    .sort();
  const blockingPlanNames = representativePlanAnalyses
    .filter(
      (analysis) =>
        analysis.weak_variety || analysis.over_reuse || analysis.unresolved_template_ids.length > 0,
    )
    .map((analysis) => analysis.plan_name)
    .sort();

  return {
    template_rows: templateRows,
    cell_rows: cellRows,
    gap_rows: gapRows,
    first_wave_gate: {
      passes: blockingCellKeys.length === 0 && blockingPlanNames.length === 0,
      blocking_cell_keys: blockingCellKeys,
      blocking_plan_names: blockingPlanNames,
    },
  };
}
