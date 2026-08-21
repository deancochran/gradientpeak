import type {
  ActivityNativeIntensityValue,
  ActivityPrescriptionQuantificationBundle,
} from "../activity-quantification";

export type PlannedQuantity<T> =
  | { status: "known" | "estimated"; value: T }
  | { status: "partial"; value: T | null; reason: string }
  | { status: "unavailable"; value: null; reason: string };

export type PlannedCalculatedQuantity = PlannedQuantity<number> & {
  basis: "athlete_personalized" | "mixed" | "plan_intent" | null;
};

export type PlannedEstimate = {
  distanceMeters: PlannedQuantity<number>;
  durationSeconds: PlannedQuantity<number>;
  prescribedIntensity: PlannedQuantity<ActivityNativeIntensityValue[]>;
  normalizedIntensity: PlannedCalculatedQuantity;
  load: PlannedCalculatedQuantity;
};

function calculatedBasis(
  bundle: ActivityPrescriptionQuantificationBundle,
): PlannedCalculatedQuantity["basis"] {
  const contributors = bundle.members.filter((member) => member.commonLoad.status === "available");
  if (contributors.length === 0) return null;
  const personalizedCount = contributors.filter(
    (member) => member.commonLoad.thresholdEvidence !== null,
  ).length;
  if (personalizedCount === 0) return "plan_intent";
  return personalizedCount === contributors.length ? "athlete_personalized" : "mixed";
}

function scalarQuantity(input: {
  status: "complete" | "partial" | "unavailable";
  value: number | null;
  estimated: boolean;
  unavailableReason: string;
}): PlannedQuantity<number> {
  if (input.status === "unavailable" || input.value === null) {
    return { status: "unavailable", value: null, reason: input.unavailableReason };
  }
  if (input.status === "partial") {
    return { status: "partial", value: input.value, reason: "incomplete_members" };
  }
  return { status: input.estimated ? "estimated" : "known", value: input.value };
}

/**
 * Reads each planned quantity independently. Missing or partial evidence is never
 * converted to zero, while a real numeric zero remains a valid known/calculated value.
 */
export function getPlannedEstimate(
  bundle: ActivityPrescriptionQuantificationBundle,
): PlannedEstimate {
  const summary = bundle.summary;
  const durationEstimated = bundle.members.some(
    (member) => member.duration.elapsed.evidenceRole !== "prescribed",
  );
  const distanceEstimated = bundle.members.some(
    (member) =>
      member.distance.status !== "unavailable" && member.distance.evidenceRole !== "prescribed",
  );
  const prescribedValues = bundle.members.flatMap((member) => member.intensity.prescribed.values);
  const prescribedIncomplete = bundle.members.some(
    (member) => member.intensity.prescribed.status !== "available",
  );
  const prescribedIntensity: PlannedEstimate["prescribedIntensity"] =
    prescribedValues.length === 0
      ? { status: "unavailable", value: null, reason: "not_authored" }
      : prescribedIncomplete
        ? { status: "partial", value: prescribedValues, reason: "incomplete_members" }
        : { status: "known", value: prescribedValues };
  const basis = calculatedBasis(bundle);
  const commonLoad = summary.commonLoad;
  const calculated = (value: number | null): PlannedCalculatedQuantity => {
    if (commonLoad.status === "unavailable") {
      return { status: "unavailable", value: null, reason: commonLoad.reason, basis: null };
    }
    if (value === null) {
      return { status: "unavailable", value: null, reason: "no_load_data", basis: null };
    }
    if (commonLoad.status === "partial") {
      return { status: "partial", value, reason: "incomplete_members", basis };
    }
    return { status: "estimated", value, basis };
  };

  return {
    durationSeconds: scalarQuantity({
      status: summary.duration.elapsed.status,
      value: summary.duration.elapsed.value,
      estimated: durationEstimated,
      unavailableReason:
        "reason" in summary.duration.elapsed
          ? summary.duration.elapsed.reason
          : "no_available_values",
    }),
    distanceMeters: scalarQuantity({
      status: summary.distance.status,
      value: summary.distance.value,
      estimated: distanceEstimated,
      unavailableReason:
        "reason" in summary.distance ? summary.distance.reason : "no_available_values",
    }),
    prescribedIntensity,
    normalizedIntensity: calculated(
      commonLoad.status === "unavailable" ? null : commonLoad.intensity,
    ),
    load: calculated(commonLoad.status === "unavailable" ? null : commonLoad.load),
  };
}
