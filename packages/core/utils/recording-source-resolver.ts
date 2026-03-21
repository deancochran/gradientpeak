import type {
  MetricFamily,
  MetricProvenance,
  MetricSourceCandidate,
  MetricSourceSelection,
  MetricSourceType,
} from "../schemas/recording-session";

export interface RecordingSourceResolverContext {
  isIndoor?: boolean;
  preferredSourceId?: string | null;
  selectedAt?: string | null;
}

const DEFAULT_PRIORITY: Record<
  Exclude<MetricFamily, "speed" | "distance">,
  readonly MetricSourceType[]
> = {
  heart_rate: ["chest_strap", "optical", "trainer_passthrough", "manual"],
  power: ["power_meter", "trainer_power", "manual"],
  cadence: ["cadence_sensor", "power_meter", "trainer_cadence", "manual"],
  position: ["gps"],
  elevation: ["gps", "derived"],
};

const OUTDOOR_SPEED_PRIORITY: readonly MetricSourceType[] = [
  "speed_sensor",
  "gps",
  "derived",
  "manual",
];

const INDOOR_SPEED_PRIORITY: readonly MetricSourceType[] = [
  "speed_sensor",
  "trainer_speed",
  "derived",
  "manual",
];

function getPriority(metricFamily: MetricFamily, isIndoor: boolean): readonly MetricSourceType[] {
  if (metricFamily === "speed" || metricFamily === "distance") {
    return isIndoor ? INDOOR_SPEED_PRIORITY : OUTDOOR_SPEED_PRIORITY;
  }

  return DEFAULT_PRIORITY[metricFamily];
}

function buildUnavailableSelection(
  metricFamily: MetricFamily,
  selectedAt?: string | null,
): MetricSourceSelection {
  return {
    metricFamily,
    sourceId: null,
    sourceType: null,
    provenance: "unavailable",
    selectionMethod: "unavailable",
    selectedAt: selectedAt ?? null,
  };
}

function getSelectionMethod(
  candidate: MetricSourceCandidate,
  priorityIndex: number,
  preferredSourceId?: string | null,
): MetricSourceSelection["selectionMethod"] {
  if (preferredSourceId && candidate.sourceId === preferredSourceId) {
    return "preferred";
  }

  if (candidate.provenance === "defaulted") {
    return "defaulted";
  }

  if (candidate.provenance === "derived" || priorityIndex > 0) {
    return "fallback";
  }

  return "automatic";
}

/**
 * Resolves one canonical source for a metric family.
 *
 * Preference wins first when the requested source is available. Otherwise the
 * resolver falls back to a deterministic priority list and uses source id as a
 * stable tie-breaker.
 */
export function resolveMetricSource(
  metricFamily: MetricFamily,
  candidates: readonly MetricSourceCandidate[],
  context: RecordingSourceResolverContext = {},
): MetricSourceSelection {
  const availableCandidates = candidates.filter(
    (candidate) => candidate.metricFamily === metricFamily && candidate.isAvailable,
  );

  if (availableCandidates.length === 0) {
    return buildUnavailableSelection(metricFamily, context.selectedAt);
  }

  const preferredCandidate = context.preferredSourceId
    ? availableCandidates.find((candidate) => candidate.sourceId === context.preferredSourceId)
    : undefined;

  const priority = getPriority(metricFamily, context.isIndoor ?? false);
  const rankedCandidates = [...availableCandidates].sort((left, right) => {
    const leftPriority = priority.indexOf(left.sourceType);
    const rightPriority = priority.indexOf(right.sourceType);
    const normalizedLeftPriority = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
    const normalizedRightPriority = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;

    if (normalizedLeftPriority !== normalizedRightPriority) {
      return normalizedLeftPriority - normalizedRightPriority;
    }

    if (left.provenance !== right.provenance) {
      const provenanceOrder: Record<MetricProvenance, number> = {
        actual: 0,
        derived: 1,
        defaulted: 2,
        unavailable: 3,
      };

      return provenanceOrder[left.provenance] - provenanceOrder[right.provenance];
    }

    return left.sourceId.localeCompare(right.sourceId);
  });

  const selectedCandidate = preferredCandidate ?? rankedCandidates[0];

  if (!selectedCandidate) {
    return buildUnavailableSelection(metricFamily, context.selectedAt);
  }

  const priorityIndex = priority.indexOf(selectedCandidate.sourceType);

  return {
    metricFamily,
    sourceId: selectedCandidate.sourceId,
    sourceType: selectedCandidate.sourceType,
    provenance: selectedCandidate.provenance,
    selectionMethod: getSelectionMethod(
      selectedCandidate,
      priorityIndex,
      context.preferredSourceId,
    ),
    selectedAt: context.selectedAt ?? null,
  };
}

/**
 * Resolves canonical selections for each requested metric family.
 */
export function resolveMetricSources(
  metricFamilies: readonly MetricFamily[],
  candidates: readonly MetricSourceCandidate[],
  context: Omit<RecordingSourceResolverContext, "preferredSourceId"> & {
    preferredSourceIds?: Partial<Record<MetricFamily, string>>;
  } = {},
): MetricSourceSelection[] {
  return metricFamilies.map((metricFamily) =>
    resolveMetricSource(metricFamily, candidates, {
      isIndoor: context.isIndoor,
      preferredSourceId: context.preferredSourceIds?.[metricFamily] ?? null,
      selectedAt: context.selectedAt,
    }),
  );
}

export const recordingSourcePriority = {
  heart_rate: DEFAULT_PRIORITY.heart_rate,
  power: DEFAULT_PRIORITY.power,
  cadence: DEFAULT_PRIORITY.cadence,
  speedIndoor: INDOOR_SPEED_PRIORITY,
  speedOutdoor: OUTDOOR_SPEED_PRIORITY,
  distanceIndoor: INDOOR_SPEED_PRIORITY,
  distanceOutdoor: OUTDOOR_SPEED_PRIORITY,
  position: DEFAULT_PRIORITY.position,
  elevation: DEFAULT_PRIORITY.elevation,
} as const;
