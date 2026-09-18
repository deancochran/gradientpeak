import { describe, expect, it } from "vitest";
import { SYSTEM_TEMPLATES } from "../samples";
import {
  type ActivityPlanAdaptation,
  type ActivityPlanDuration,
  type ActivityPlanIntervalStep,
  type ActivityPlanTarget,
  activityPlanAuthoringContentSchema,
  activityPlanAuthoringStructureSchema,
  activityPlanStructureSchema,
  activityPlanAuthoringIssueCodes as codes,
  type EditableActivityPlanStructure,
  getActivityPlanAuthoringIssues,
  getPermissibleActivityPlanDurationTypes,
  resolveActivityPlanStructure,
} from "./index";

const ids = {
  segment: "11111111-1111-4111-8111-111111111111",
  interval: "22222222-2222-4222-8222-222222222222",
  step: "33333333-3333-4333-8333-333333333333",
  control: "44444444-4444-4444-8444-444444444444",
};
function plan(
  category: EditableActivityPlanStructure["activity_category"] = "run",
  step: Partial<ActivityPlanIntervalStep> = {},
): EditableActivityPlanStructure {
  return {
    version: 3,
    activity_category: category,
    segments: [
      {
        id: ids.segment,
        name: "Main",
        role: "activity",
        intervals: [
          {
            id: ids.interval,
            name: "Set",
            repetitions: 3,
            steps: [
              {
                id: ids.step,
                name: "Work",
                purpose: "work",
                duration: { type: "time", seconds: 60 },
                targets: [{ type: "RPE", intensity: 5 }],
                ...step,
              },
            ],
          },
        ],
      },
    ],
  };
}
function intensityAdaptation(
  type: ActivityPlanTarget["type"],
  range = {
    minimum: 5,
    default: 5,
    maximum: 6,
    increment: 0.5,
  },
): ActivityPlanAdaptation {
  return {
    controls: [
      {
        id: ids.control,
        key: "intensity",
        label: "Intensity",
        kind: "target_intensity",
        range,
        targets: [
          {
            type: "target_intensity",
            activitySegmentId: ids.segment,
            intervalId: ids.interval,
            stepId: ids.step,
            targetType: type,
          },
        ],
      },
    ],
  };
}
const content = (structure = plan(), adaptation?: ActivityPlanAdaptation) => ({
  structure,
  intent: { training_intent: "general_maintenance" },
  adaptation,
});
const stepPath = ["segments", 0, "intervals", 0, "steps", 0];

describe("current activity-plan authoring", () => {
  const durations: ActivityPlanDuration[] = [
    { type: "time", seconds: 60 },
    { type: "distance", meters: 100 },
    { type: "repetitions", count: 8 },
    { type: "untilFinished" },
  ];
  for (const category of ["run", "bike", "swim", "strength", "other"] as const) {
    it.each(durations)(`${category}: completion $type (interval repeats unchanged)`, (duration) => {
      const structure = plan(category, { duration });
      const permitted =
        duration.type === "time" ||
        (duration.type === "distance" && ["run", "bike", "swim"].includes(category)) ||
        (duration.type === "repetitions" && category === "strength");
      expect(activityPlanStructureSchema.safeParse(structure).success).toBe(true);
      expect(activityPlanAuthoringStructureSchema.safeParse(structure).success).toBe(permitted);
      expect(getPermissibleActivityPlanDurationTypes(category)).toContain("time");
      expect(
        getPermissibleActivityPlanDurationTypes(category).some((type) => type === duration.type),
      ).toBe(permitted);
    });
  }
  it.each([
    { targets: [{ type: "RPE", intensity: 5 }], valid: true },
    { targets: [{ type: "bpm", intensity: 120 }], valid: false },
    {
      targets: [
        { type: "RPE", intensity: 5 },
        { type: "bpm", intensity: 120 },
      ],
      valid: false,
    },
    {
      targets: [
        { type: "RPE", intensity: 5 },
        { type: "RPE", intensity: 6 },
      ],
      valid: false,
    },
    { targets: [], valid: false },
  ] satisfies {
    targets: ActivityPlanTarget[];
    valid: boolean;
  }[])("strength repetition targets $targets", ({ targets, valid }) => {
    expect(
      activityPlanAuthoringStructureSchema.safeParse(
        plan("strength", {
          duration: { type: "repetitions", count: 8 },
          targets,
        }),
      ).success,
    ).toBe(valid);
  });
  it.each([
    { type: "RPE", intensity: 1, valid: true },
    { type: "RPE", intensity: 1.5, valid: true },
    { type: "RPE", intensity: 9.5, valid: true },
    { type: "RPE", intensity: 10, valid: true },
    { type: "RPE", intensity: 0.5, valid: false },
    { type: "RPE", intensity: 10.5, valid: false },
    { type: "RPE", intensity: 5.25, valid: false },
    { type: "RPE", intensity: Number.NaN, valid: false },
    { type: "RPE", intensity: Number.POSITIVE_INFINITY, valid: false },
    { type: "%MaxHR", intensity: 100, valid: true },
    { type: "%MaxHR", intensity: 100.5, valid: false },
    { type: "%ThresholdHR", intensity: 105, valid: true },
    { type: "cadence", intensity: 90, valid: false },
  ] satisfies (ActivityPlanTarget & { valid: boolean })[])("$type $intensity", ({
    valid,
    ...target
  }) => {
    expect(
      activityPlanAuthoringStructureSchema.safeParse(plan("run", { targets: [target] })).success,
    ).toBe(valid);
  });
  it("allows cadence as support and requires explicit purpose without name inference", () => {
    const structure = plan("run", {
      purpose: undefined,
      targets: [
        { type: "cadence", intensity: 90 },
        { type: "RPE", intensity: 5 },
      ],
    });
    expect(getActivityPlanAuthoringIssues(structure)).toEqual([
      {
        code: codes.purposeRequired,
        path: [...stepPath, "purpose"],
        message: expect.any(String),
      },
    ]);
    expect(activityPlanStructureSchema.safeParse(structure).success).toBe(true);
    expect(
      activityPlanAuthoringStructureSchema.safeParse(
        plan("run", {
          targets: [
            { type: "cadence", intensity: 90 },
            { type: "speed", intensity: 10 },
          ],
        }),
      ).success,
    ).toBe(true);
  });
  it.each([
    0, 0.1, 10,
  ])("distance speed %s must be positive, timed zero remains permitted", (intensity) => {
    const targets: ActivityPlanTarget[] = [{ type: "speed", intensity }];
    expect(activityPlanAuthoringStructureSchema.safeParse(plan("run", { targets })).success).toBe(
      true,
    );
    const structure = plan("run", { duration: { type: "distance", meters: 100 }, targets });
    expect(activityPlanAuthoringStructureSchema.safeParse(structure).success).toBe(intensity > 0);
    expect(activityPlanStructureSchema.safeParse(structure).success).toBe(true);
  });
  it("reports stable issue codes and structure-relative paths in both helper and schema", () => {
    const structure = plan("run", { targets: [{ type: "%MaxHR", intensity: 101 }] });
    expect(getActivityPlanAuthoringIssues(structure)[0]).toMatchObject({
      code: codes.maxHrExceeded,
      path: [...stepPath, "targets", 0, "intensity"],
    });
    const result = activityPlanAuthoringStructureSchema.safeParse(structure);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]).toMatchObject({
        path: [...stepPath, "targets", 0, "intensity"],
        params: { activityPlanIssueCode: codes.maxHrExceeded },
      });
  });
  it.each([
    { duration: { type: "untilFinished" } },
    { purpose: undefined },
    { targets: [{ type: "RPE", intensity: 5.25 }] },
    { targets: [{ type: "%MaxHR", intensity: 110 }] },
    { targets: [{ type: "cadence", intensity: 90 }] },
  ] satisfies Partial<ActivityPlanIntervalStep>[])("historical parser and resolver preserve $targets $duration $purpose", (step) => {
    const structure = plan("run", step);
    expect(activityPlanAuthoringStructureSchema.safeParse(structure).success).toBe(false);
    expect(resolveActivityPlanStructure({ structure })).toMatchObject({
      status: "resolved",
      structure,
    });
  });
});

describe("authoring adaptation surface", () => {
  it("accepts valid ranges and preserves the input", () => {
    const input = content(plan(), intensityAdaptation("RPE"));
    const before = structuredClone(input);
    expect(activityPlanAuthoringContentSchema.safeParse(input).success).toBe(true);
    expect(input).toEqual(before);
  });
  it.each([
    { type: "RPE", value: 5, maximum: 6, minimum: 5, increment: 0.25, code: codes.invalidRpe },
    {
      type: "%MaxHR",
      value: 100,
      maximum: 101,
      minimum: 100,
      increment: 1,
      code: codes.maxHrExceeded,
    },
    {
      type: "speed",
      value: 1,
      maximum: 1,
      minimum: 0,
      increment: 1,
      code: codes.distanceSpeedNotPositive,
    },
  ] satisfies {
    type: ActivityPlanTarget["type"];
    value: number;
    minimum: number;
    maximum: number;
    increment: number;
    code: string;
  }[])("rejects invalid resolved $type state", ({
    type,
    value,
    minimum,
    maximum,
    increment,
    code,
  }) => {
    const structure = plan("run", {
      duration: { type: "distance", meters: 100 },
      targets: [{ type, intensity: value }],
    });
    const adaptation = intensityAdaptation(type, { minimum, default: value, maximum, increment });
    const result = activityPlanAuthoringContentSchema.safeParse(content(structure, adaptation));
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["structure", ...stepPath, "targets", 0, "intensity"],
          params: expect.objectContaining({
            activityPlanIssueCode: code,
            adaptation_values: expect.any(Object),
          }),
        }),
      );
    expect(
      resolveActivityPlanStructure({
        structure,
        adaptation,
        adaptation_values: { intensity: maximum },
      }).status,
    ).toBe("resolved");
  });
  it("checks explicit allowed states rather than forbidden grid points", () => {
    const adaptation = intensityAdaptation("RPE", {
      minimum: 5,
      default: 5,
      maximum: 6,
      increment: 0.25,
    });
    adaptation.allowedStates = [
      { id: ids.segment, label: "Default", values: { intensity: 5 } },
      { id: ids.interval, label: "Harder", values: { intensity: 6 } },
    ];
    expect(activityPlanAuthoringContentSchema.safeParse(content(plan(), adaptation)).success).toBe(
      true,
    );
    adaptation.allowedStates.push({ id: ids.step, label: "Invalid", values: { intensity: 5.25 } });
    expect(activityPlanAuthoringContentSchema.safeParse(content(plan(), adaptation)).success).toBe(
      false,
    );
  });
  it("does not round near-half-point RPE states into valid authoring values", () => {
    const increment = 2 ** -32;
    const adaptation = intensityAdaptation("RPE", {
      minimum: 5,
      default: 5,
      maximum: 5 + increment,
      increment,
    });
    const result = activityPlanAuthoringContentSchema.safeParse(content(plan(), adaptation));
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]).toMatchObject({
        params: {
          activityPlanIssueCode: codes.invalidRpe,
          adaptation_values: { intensity: 5 + increment },
        },
      });
  });
  it("rejects multiple owners even when their values agree; historic resolver still accepts them", () => {
    const adaptation = intensityAdaptation("RPE", {
      minimum: 5,
      default: 5,
      maximum: 5,
      increment: 1,
    });
    const first = adaptation.controls[0];
    if (!first) throw new Error("Missing fixture control");
    adaptation.controls.push({ ...first, id: ids.step, key: "second" });
    const result = activityPlanAuthoringContentSchema.safeParse(content(plan(), adaptation));
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]).toMatchObject({
        path: ["adaptation", "controls", 1, "targets", 0],
        params: { activityPlanIssueCode: codes.multipleFieldOwners },
      });
    expect(resolveActivityPlanStructure({ structure: plan(), adaptation }).status).toBe("resolved");
  });
  it("rejects nonexistent targets and mismatched authored defaults", () => {
    const adaptation = intensityAdaptation("RPE");
    const first = adaptation.controls[0];
    if (!first) throw new Error("Missing fixture control");
    first.range.default = 5.5;
    expect(activityPlanAuthoringContentSchema.safeParse(content(plan(), adaptation)).success).toBe(
      false,
    );
    first.range.default = 5;
    first.targets = [
      {
        type: "target_intensity",
        activitySegmentId: ids.segment,
        intervalId: ids.interval,
        stepId: ids.control,
        targetType: "RPE",
      },
    ];
    expect(activityPlanAuthoringContentSchema.safeParse(content(plan(), adaptation)).success).toBe(
      false,
    );
  });
  it("treats step-quantity and recovery-quantity aliases as the same owned field", () => {
    const target = {
      activitySegmentId: ids.segment,
      intervalId: ids.interval,
      stepId: ids.step,
      quantityType: "time" as const,
    };
    const range = { minimum: 60, default: 60, maximum: 60, increment: 1 };
    const adaptation: ActivityPlanAdaptation = {
      controls: [
        {
          id: ids.control,
          key: "duration",
          label: "Duration",
          kind: "step_quantity",
          range,
          targets: [{ ...target, type: "step_quantity" }],
        },
        {
          id: ids.interval,
          key: "recovery",
          label: "Recovery",
          kind: "recovery_quantity",
          range,
          targets: [{ ...target, type: "recovery_step" }],
        },
      ],
    };
    const result = activityPlanAuthoringContentSchema.safeParse(
      content(plan("run", { purpose: "recovery" }), adaptation),
    );
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]).toMatchObject({
        params: { activityPlanIssueCode: codes.multipleFieldOwners },
      });
  });
  it("checks joint quantity states against document-wide execution limits", () => {
    const structure = plan("run", { duration: { type: "time", seconds: 60000 } });
    const adaptation: ActivityPlanAdaptation = {
      controls: [
        {
          id: ids.control,
          key: "repeats",
          label: "Repeats",
          kind: "interval_repetitions",
          range: { minimum: 3, default: 3, maximum: 10, increment: 1 },
          targets: [
            {
              type: "interval_repetitions",
              activitySegmentId: ids.segment,
              intervalId: ids.interval,
            },
          ],
        },
        {
          id: ids.step,
          key: "seconds",
          label: "Seconds",
          kind: "step_quantity",
          range: { minimum: 60000, default: 60000, maximum: 86400, increment: 26400 },
          targets: [
            {
              type: "step_quantity",
              activitySegmentId: ids.segment,
              intervalId: ids.interval,
              stepId: ids.step,
              quantityType: "time",
            },
          ],
        },
      ],
    };
    expect(
      resolveActivityPlanStructure({ structure, adaptation, adaptation_values: { repeats: 10 } })
        .status,
    ).toBe("resolved");
    expect(
      resolveActivityPlanStructure({ structure, adaptation, adaptation_values: { seconds: 86400 } })
        .status,
    ).toBe("resolved");
    const result = activityPlanAuthoringContentSchema.safeParse(content(structure, adaptation));
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]).toMatchObject({
        params: {
          activityPlanIssueCode: codes.invalidResolution,
          adaptation_values: { repeats: 8, seconds: 86400 },
        },
      });
  });
  it("fails closed on oversized surfaces but accepts a bounded allowed-state subset", () => {
    const adaptation = intensityAdaptation("speed", {
      minimum: 1,
      default: 5,
      maximum: 100,
      increment: 0.001,
    });
    const structure = plan("run", { targets: [{ type: "speed", intensity: 5 }] });
    const result = activityPlanAuthoringContentSchema.safeParse(content(structure, adaptation));
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]).toMatchObject({
        params: { activityPlanIssueCode: codes.surfaceTooLarge },
      });
    adaptation.allowedStates = [{ id: ids.step, label: "Default", values: { intensity: 5 } }];
    expect(
      activityPlanAuthoringContentSchema.safeParse(content(structure, adaptation)).success,
    ).toBe(true);
  });
  it("validates intent in adapted states, not only defaults", () => {
    const structure = plan("run", { targets: [{ type: "RPE", intensity: 8 }] });
    const adaptation = intensityAdaptation("RPE", {
      minimum: 7,
      default: 8,
      maximum: 8,
      increment: 1,
    });
    const result = activityPlanAuthoringContentSchema.safeParse({
      structure,
      adaptation,
      intent: { training_intent: "vo2max" },
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]).toMatchObject({
        path: ["intent", "training_intent"],
        params: {
          activityPlanIssueCode: codes.incompatibleIntent,
          adaptation_values: { intensity: 7 },
        },
      });
  });
});

it("keeps all existing samples historically parseable and executable after authoring checks", () => {
  for (const sample of SYSTEM_TEMPLATES) {
    const before = structuredClone(sample.structure);
    activityPlanAuthoringStructureSchema.safeParse(sample.structure);
    expect(activityPlanStructureSchema.safeParse(sample.structure).success).toBe(true);
    expect(resolveActivityPlanStructure({ structure: sample.structure }).status).toBe("resolved");
    expect(sample.structure).toEqual(before);
  }
});
