import { Decoder, Stream } from "@garmin/fitsdk";
import { describe, expect, it } from "vitest";
import type { PlannedWorkoutExportDocument } from "../plan/plannedWorkoutExportDocument";
import {
  encodeGarminWorkoutFitDiagnostic,
  getGarminWorkoutFitUnsupportedReasons,
} from "./garmin-workout-fit";

const STEP_IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
] as const;

function supportedDocument(): PlannedWorkoutExportDocument {
  return {
    version: 1,
    event: {
      id: "event-1",
      name: "Bike diagnostics",
      description: "FIT workout round trip",
    },
    sport: "bike",
    blocks: [
      {
        kind: "repeat",
        sourceIntervalId: "10000000-0000-4000-8000-000000000001",
        name: "Main set",
        count: 3,
        steps: [
          {
            kind: "step",
            sourceStepId: STEP_IDS[0],
            name: "Power",
            description: "Hold steady",
            notes: "Seated",
            duration: { kind: "time", value: 60, unit: "seconds" },
            targets: [
              {
                kind: "absolute",
                metric: "power",
                sourceValue: 250,
                sourceUnit: "watts",
                value: 250,
                unit: "watts",
              },
            ],
          },
          {
            kind: "step",
            sourceStepId: STEP_IDS[1],
            name: "Speed",
            duration: { kind: "distance", value: 1000, unit: "meters" },
            targets: [
              {
                kind: "absolute",
                metric: "speed",
                sourceValue: 12.6,
                sourceUnit: "kilometers_per_hour",
                value: 3.5,
                unit: "meters_per_second",
              },
            ],
          },
          {
            kind: "step",
            sourceStepId: STEP_IDS[2],
            name: "Cadence",
            duration: { kind: "open" },
            targets: [
              {
                kind: "absolute",
                metric: "cadence",
                sourceValue: 90,
                sourceUnit: "revolutions_per_minute",
                value: 90,
                unit: "revolutions_per_minute",
              },
            ],
          },
          {
            kind: "step",
            sourceStepId: STEP_IDS[3],
            name: "Heart rate",
            duration: { kind: "repetitions", value: 12, unit: "count" },
            targets: [
              {
                kind: "absolute",
                metric: "heart_rate",
                sourceValue: 150,
                sourceUnit: "beats_per_minute",
                value: 150,
                unit: "beats_per_minute",
              },
            ],
          },
        ],
      },
      {
        kind: "repeat",
        sourceIntervalId: "10000000-0000-4000-8000-000000000002",
        name: "Relative targets",
        count: 1,
        steps: [
          {
            kind: "step",
            sourceStepId: STEP_IDS[4],
            name: "FTP percent",
            duration: { kind: "time", value: 30, unit: "seconds" },
            targets: [
              {
                kind: "relative",
                metric: "power",
                basis: "ftp",
                value: 95,
                unit: "percent",
              },
            ],
          },
          {
            kind: "step",
            sourceStepId: STEP_IDS[5],
            name: "Max HR percent",
            duration: { kind: "time", value: 30, unit: "seconds" },
            targets: [
              {
                kind: "relative",
                metric: "heart_rate",
                basis: "maximum_heart_rate",
                value: 80,
                unit: "percent",
              },
            ],
          },
        ],
      },
    ],
  };
}

type DecodedMessages = {
  fileIdMesgs: Array<Record<string, unknown>>;
  workoutMesgs: Array<Record<string, unknown>>;
  workoutStepMesgs: Array<Record<string, unknown>>;
};

describe("Garmin workout FIT diagnostic encoding", () => {
  it("encodes a valid workout file and round-trips workout messages through the Garmin SDK", () => {
    const result = encodeGarminWorkoutFitDiagnostic(supportedDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected workout encoding to succeed");

    const stream = Stream.fromByteArray(result.bytes);
    expect(Decoder.isFIT(stream)).toBe(true);

    const decoder = new Decoder(Stream.fromByteArray(result.bytes));
    expect(decoder.checkIntegrity()).toBe(true);
    const decoded = decoder.read();
    expect(decoded.errors).toEqual([]);

    const messages = decoded.messages as DecodedMessages;
    expect(messages.fileIdMesgs).toEqual([
      expect.objectContaining({ type: "workout", manufacturer: "development", product: 1 }),
    ]);
    expect(messages.workoutMesgs).toEqual([
      expect.objectContaining({
        sport: "cycling",
        numValidSteps: 7,
        wktName: "Bike diagnostics",
        wktDescription: "FIT workout round trip",
      }),
    ]);
    expect(messages.workoutStepMesgs).toHaveLength(7);
    expect(messages.workoutStepMesgs[0]).toEqual(
      expect.objectContaining({
        messageIndex: 0,
        durationType: "time",
        durationTime: 60,
        targetType: "power",
        customTargetPowerLow: 1250,
        customTargetPowerHigh: 1250,
        notes: "Hold steady\nSeated",
      }),
    );
    expect(messages.workoutStepMesgs[1]).toEqual(
      expect.objectContaining({
        durationType: "distance",
        durationDistance: 1000,
        targetType: "speed",
        customTargetSpeedLow: 3.5,
        customTargetSpeedHigh: 3.5,
      }),
    );
    expect(messages.workoutStepMesgs[2]).toEqual(
      expect.objectContaining({
        durationType: "open",
        targetType: "cadence",
        customTargetCadenceLow: 90,
        customTargetCadenceHigh: 90,
      }),
    );
    expect(messages.workoutStepMesgs[3]).toEqual(
      expect.objectContaining({
        durationType: "reps",
        durationReps: 12,
        targetType: "heartRate",
        customTargetHeartRateLow: 250,
        customTargetHeartRateHigh: 250,
      }),
    );
    expect(messages.workoutStepMesgs[4]).toEqual(
      expect.objectContaining({
        messageIndex: 4,
        durationType: "repeatUntilStepsCmplt",
        durationStep: 0,
        repeatSteps: 3,
      }),
    );
    expect(messages.workoutStepMesgs[5]).toEqual(
      expect.objectContaining({ targetType: "power", customTargetPowerLow: 95 }),
    );
    expect(messages.workoutStepMesgs[6]).toEqual(
      expect.objectContaining({ targetType: "heartRate", customTargetHeartRateLow: 80 }),
    );
  });

  it("returns explicit reasons instead of encoding structures FIT cannot preserve", () => {
    const document = supportedDocument();
    document.sport = "swim";
    document.event.description = "😀".repeat(64);
    const firstBlock = document.blocks[0];
    if (firstBlock == null) throw new Error("Expected fixture block");
    const [powerStep, speedStep, cadenceStep] = firstBlock.steps;
    if (powerStep == null || speedStep == null || cadenceStep == null) {
      throw new Error("Expected fixture steps");
    }
    powerStep.targets.push({
      kind: "absolute",
      metric: "cadence",
      sourceValue: 90,
      sourceUnit: "revolutions_per_minute",
      value: 90,
      unit: "revolutions_per_minute",
    });
    speedStep.targets = [
      {
        kind: "relative",
        metric: "heart_rate",
        basis: "threshold_heart_rate",
        value: 90,
        unit: "percent",
      },
    ];
    cadenceStep.targets = [
      {
        kind: "absolute",
        metric: "perceived_effort",
        sourceValue: 7,
        sourceUnit: "rpe",
        value: 7,
        unit: "rpe",
      },
    ];

    const reasons = getGarminWorkoutFitUnsupportedReasons(document);
    expect(reasons.map((reason) => reason.code)).toEqual([
      "unsupported_sport",
      "fit_string_too_long",
      "multiple_targets",
      "unsupported_relative_target_basis",
      "unsupported_target",
    ]);
    expect(encodeGarminWorkoutFitDiagnostic(document)).toEqual({ ok: false, reasons });
  });
});
