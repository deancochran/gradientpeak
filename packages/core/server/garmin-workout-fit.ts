import { Encoder, Profile } from "@garmin/fitsdk";
import type {
  PlannedWorkoutExportDocument,
  PlannedWorkoutExportTarget,
} from "../plan/plannedWorkoutExportDocument";
import { plannedWorkoutExportDocumentSchema } from "../plan/plannedWorkoutExportDocument";

const FIT_FILE_TYPE_WORKOUT = "workout";
const FIT_MANUFACTURER_DEVELOPMENT = "development";
const FIT_SPORT = { bike: "cycling", run: "running" } as const;
const FIT_UINT32_MAX = 0xffff_ffff;
const FIT_STRING_MAX_UTF8_BYTES = 254;

const WORKOUT_CAPABILITY = {
  interval: 0x0000_0001,
  custom: 0x0000_0002,
  speed: 0x0000_0080,
  heartRate: 0x0000_0100,
  distance: 0x0000_0200,
  cadence: 0x0000_0400,
  power: 0x0000_0800,
} as const;

export type GarminWorkoutFitUnsupportedReasonCode =
  | "encoding_failed"
  | "fit_string_too_long"
  | "invalid_document"
  | "lossy_projection"
  | "multiple_targets"
  | "target_out_of_range"
  | "unsupported_relative_target_basis"
  | "unsupported_sport"
  | "unsupported_target";

export type GarminWorkoutFitUnsupportedReason = {
  code: GarminWorkoutFitUnsupportedReasonCode;
  message: string;
  path: Array<string | number>;
};

export type GarminWorkoutFitEncodingResult =
  | {
      ok: true;
      bytes: Uint8Array;
    }
  | {
      ok: false;
      reasons: GarminWorkoutFitUnsupportedReason[];
    };

type FitWorkoutStepMessage = {
  messageIndex: number;
  wktStepName?: string;
  durationType: "distance" | "open" | "repeatUntilStepsCmplt" | "reps" | "time";
  durationValue?: number;
  targetType: "cadence" | "heartRate" | "open" | "power" | "speed";
  targetValue?: number;
  customTargetValueLow?: number;
  customTargetValueHigh?: number;
  notes?: string;
};

type FitTarget = Pick<
  FitWorkoutStepMessage,
  "customTargetValueHigh" | "customTargetValueLow" | "targetType" | "targetValue"
>;

function fitStringByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function addFitStringReason(
  reasons: GarminWorkoutFitUnsupportedReason[],
  value: string | undefined,
  path: Array<string | number>,
): void {
  if (value != null && fitStringByteLength(value) > FIT_STRING_MAX_UTF8_BYTES) {
    reasons.push({
      code: "fit_string_too_long",
      message: `FIT strings cannot exceed ${FIT_STRING_MAX_UTF8_BYTES} UTF-8 bytes.`,
      path,
    });
  }
}

function stepNotes(
  step: PlannedWorkoutExportDocument["blocks"][number]["steps"][number],
): string | undefined {
  const parts = [step.description, step.notes].filter((part): part is string => part != null);
  return parts.length === 0 ? undefined : parts.join("\n");
}

function inspectTarget(
  target: PlannedWorkoutExportTarget,
  path: Array<string | number>,
): GarminWorkoutFitUnsupportedReason[] {
  const reasons: GarminWorkoutFitUnsupportedReason[] = [];

  if (target.metric === "perceived_effort") {
    reasons.push({
      code: "unsupported_target",
      message: "FIT workout steps cannot represent perceived-effort targets.",
      path,
    });
    return reasons;
  }

  if (
    target.kind === "relative" &&
    ((target.metric === "heart_rate" && target.basis !== "maximum_heart_rate") ||
      (target.metric === "power" && target.basis !== "ftp"))
  ) {
    reasons.push({
      code: "unsupported_relative_target_basis",
      message:
        "FIT workout percentages support maximum-heart-rate targets for heart rate and FTP targets for power.",
      path: [...path, "basis"],
    });
    return reasons;
  }

  if (target.kind === "relative" && target.metric === "heart_rate" && target.value > 100) {
    reasons.push({
      code: "target_out_of_range",
      message: "FIT heart-rate percentages must be between 0 and 100.",
      path: [...path, "value"],
    });
    return reasons;
  }

  if (target.kind === "relative" && target.metric === "power" && target.value >= 1000) {
    reasons.push({
      code: "target_out_of_range",
      message: "FIT power percentages must be below the watts encoding offset of 1000.",
      path: [...path, "value"],
    });
    return reasons;
  }

  const rawValue = targetRawValue(target);
  if (!Number.isInteger(rawValue) || rawValue < 0 || rawValue > FIT_UINT32_MAX) {
    reasons.push({
      code: "target_out_of_range",
      message: "Target value is outside the FIT uint32 encoding range.",
      path: [...path, "value"],
    });
  }

  return reasons;
}

/** Reports every known reason a provider-neutral workout cannot be represented safely in FIT. */
export function getGarminWorkoutFitUnsupportedReasons(
  document: PlannedWorkoutExportDocument,
): GarminWorkoutFitUnsupportedReason[] {
  const parsed = plannedWorkoutExportDocumentSchema.safeParse(document);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      code: "invalid_document" as const,
      message: issue.message,
      path: issue.path.filter((part): part is string | number => typeof part !== "symbol"),
    }));
  }

  const reasons: GarminWorkoutFitUnsupportedReason[] = [];
  if (!parsed.data.segments || !parsed.data.categories || !parsed.data.legacyProjection) {
    reasons.push({
      code: "lossy_projection",
      message:
        "Garmin FIT encoding requires segments, categories, and explicit lossless projection evidence.",
      path: ["segments"],
    });
  }
  if (parsed.data.legacyProjection?.lossless === false) {
    reasons.push({
      code: "lossy_projection",
      message: "Garmin FIT encoding requires a lossless legacy workout projection.",
      path: ["legacyProjection", "lossless"],
    });
  }
  const segmentActivityCategories =
    parsed.data.segments
      ?.filter((segment) => segment.kind === "activity")
      .map((segment) => segment.category) ?? [];
  const actualCategories = new Set(segmentActivityCategories);
  if (
    actualCategories.size > 1 ||
    new Set(parsed.data.categories ?? [parsed.data.sport]).size > 1
  ) {
    reasons.push({
      code: "lossy_projection",
      message: "Garmin FIT workouts cannot preserve multiple activity categories.",
      path: ["categories"],
    });
  }
  parsed.data.segments?.forEach((segment, segmentIndex) => {
    if (segment.kind !== "activity") {
      reasons.push({
        code: "lossy_projection",
        message: `Garmin FIT workouts cannot preserve ${segment.kind} segments.`,
        path: ["segments", segmentIndex],
      });
    }
  });
  if (parsed.data.segments) {
    const segmentBlocks = parsed.data.segments.flatMap((segment) =>
      segment.kind === "activity" ? segment.blocks : [],
    );
    const declaredCategories = parsed.data.categories ?? [];
    const actualCategoryList = [...actualCategories];
    if (
      declaredCategories.length !== actualCategoryList.length ||
      declaredCategories.some((category) => !actualCategories.has(category))
    ) {
      reasons.push({
        code: "lossy_projection",
        message: "Declared categories do not match activity segment categories.",
        path: ["categories"],
      });
    }
    if (actualCategoryList.length !== 1 || actualCategoryList[0] !== parsed.data.sport) {
      reasons.push({
        code: "lossy_projection",
        message: "Root sport does not match the single activity segment category.",
        path: ["sport"],
      });
    }
    if (JSON.stringify(segmentBlocks) !== JSON.stringify(parsed.data.blocks)) {
      reasons.push({
        code: "lossy_projection",
        message: "Root workout blocks do not match activity segment contents.",
        path: ["blocks"],
      });
    }
  }
  if (
    parsed.data.legacyProjection &&
    (parsed.data.legacyProjection.sport !== parsed.data.sport ||
      JSON.stringify(parsed.data.legacyProjection.blocks) !== JSON.stringify(parsed.data.blocks))
  ) {
    reasons.push({
      code: "lossy_projection",
      message: "Legacy projection does not match the root workout projection.",
      path: ["legacyProjection"],
    });
  }
  if (parsed.data.sport !== "run" && parsed.data.sport !== "bike") {
    reasons.push({
      code: "unsupported_sport",
      message: `Garmin FIT workout diagnostics support run and bike, not ${parsed.data.sport}.`,
      path: ["sport"],
    });
  }

  addFitStringReason(reasons, parsed.data.event.name, ["event", "name"]);
  addFitStringReason(reasons, parsed.data.event.description, ["event", "description"]);

  parsed.data.blocks.forEach((block, blockIndex) => {
    block.steps.forEach((step, stepIndex) => {
      const stepPath = ["blocks", blockIndex, "steps", stepIndex];
      addFitStringReason(reasons, step.name, [...stepPath, "name"]);
      addFitStringReason(reasons, stepNotes(step), [...stepPath, "notes"]);

      if (step.targets.length > 1) {
        reasons.push({
          code: "multiple_targets",
          message:
            "A FIT workout step has only one target type and cannot preserve multiple targets.",
          path: [...stepPath, "targets"],
        });
      } else if (step.targets[0] != null) {
        reasons.push(...inspectTarget(step.targets[0], [...stepPath, "targets", 0]));
      }
    });
  });

  return reasons;
}

function targetRawValue(target: PlannedWorkoutExportTarget): number {
  if (target.kind === "relative") {
    return Math.round(target.value);
  }

  switch (target.metric) {
    case "speed":
      return Math.round(target.value * 1000);
    case "heart_rate":
      return Math.round(target.value) + 100;
    case "power":
      return Math.round(target.value) + 1000;
    case "cadence":
    case "perceived_effort":
      return Math.round(target.value);
  }
}

function encodeTarget(target: PlannedWorkoutExportTarget | undefined): FitTarget {
  if (target == null) {
    return { targetType: "open" };
  }

  let targetType: FitTarget["targetType"];
  switch (target.metric) {
    case "heart_rate":
      targetType = "heartRate";
      break;
    case "speed":
    case "cadence":
    case "power":
      targetType = target.metric;
      break;
    case "perceived_effort":
      throw new Error("Unsupported perceived-effort target reached FIT encoding.");
  }
  const rawValue = targetRawValue(target);
  return {
    targetType,
    targetValue: 0,
    customTargetValueLow: rawValue,
    customTargetValueHigh: rawValue,
  };
}

function encodeStepDuration(
  duration: PlannedWorkoutExportDocument["blocks"][number]["steps"][number]["duration"],
): Pick<FitWorkoutStepMessage, "durationType" | "durationValue"> {
  switch (duration.kind) {
    case "time":
      return { durationType: "time", durationValue: Math.round(duration.value * 1000) };
    case "distance":
      return { durationType: "distance", durationValue: Math.round(duration.value * 100) };
    case "repetitions":
      return { durationType: "reps", durationValue: duration.value };
    case "open":
      return { durationType: "open" };
  }
}

function buildFitWorkoutSteps(document: PlannedWorkoutExportDocument): FitWorkoutStepMessage[] {
  const messages: FitWorkoutStepMessage[] = [];

  document.blocks.forEach((block) => {
    const firstStepIndex = messages.length;
    block.steps.forEach((step) => {
      messages.push({
        messageIndex: messages.length,
        wktStepName: step.name,
        ...encodeStepDuration(step.duration),
        ...encodeTarget(step.targets[0]),
        ...(stepNotes(step) == null ? {} : { notes: stepNotes(step) }),
      });
    });

    if (block.count > 1) {
      messages.push({
        messageIndex: messages.length,
        durationType: "repeatUntilStepsCmplt",
        durationValue: firstStepIndex,
        targetType: "open",
        targetValue: block.count,
      });
    }
  });

  return messages;
}

function workoutCapabilities(document: PlannedWorkoutExportDocument): number {
  let capabilities = WORKOUT_CAPABILITY.interval | WORKOUT_CAPABILITY.custom;
  document.blocks.forEach((block) => {
    block.steps.forEach((step) => {
      if (step.duration.kind === "distance") capabilities |= WORKOUT_CAPABILITY.distance;
      const target = step.targets[0];
      if (target?.metric === "speed") capabilities |= WORKOUT_CAPABILITY.speed;
      if (target?.metric === "heart_rate") capabilities |= WORKOUT_CAPABILITY.heartRate;
      if (target?.metric === "cadence") capabilities |= WORKOUT_CAPABILITY.cadence;
      if (target?.metric === "power") capabilities |= WORKOUT_CAPABILITY.power;
    });
  });
  return capabilities;
}

/** Encodes a diagnostic FIT workout; this does not imply Garmin delivery readiness. */
export function encodeGarminWorkoutFitDiagnostic(
  document: PlannedWorkoutExportDocument,
): GarminWorkoutFitEncodingResult {
  const reasons = getGarminWorkoutFitUnsupportedReasons(document);
  if (reasons.length > 0) return { ok: false, reasons };

  const parsedDocument = plannedWorkoutExportDocumentSchema.parse(document);
  const steps = buildFitWorkoutSteps(parsedDocument);
  const fitSport = parsedDocument.sport === "run" ? FIT_SPORT.run : FIT_SPORT.bike;

  try {
    const encoder = new Encoder();
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.FILE_ID,
      type: FIT_FILE_TYPE_WORKOUT,
      manufacturer: FIT_MANUFACTURER_DEVELOPMENT,
      product: 1,
    });
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.WORKOUT,
      sport: fitSport,
      capabilities: workoutCapabilities(parsedDocument),
      numValidSteps: steps.length,
      wktName: parsedDocument.event.name,
      ...(parsedDocument.event.description == null
        ? {}
        : { wktDescription: parsedDocument.event.description }),
    });
    steps.forEach((step) => {
      encoder.writeMesg({ mesgNum: Profile.MesgNum.WORKOUT_STEP, ...step });
    });

    return { ok: true, bytes: encoder.close() };
  } catch {
    return {
      ok: false,
      reasons: [
        {
          code: "encoding_failed",
          message: "The Garmin FIT SDK rejected the validated workout messages.",
          path: [],
        },
      ],
    };
  }
}
