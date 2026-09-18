import { describe, expect, it } from "vitest";
import { resolveActivityPlanStructure } from "./adaptation-resolution";
import { activityPlanAdaptationSchema } from "./adaptation-schema";
import { validateActivityPlanAdaptationSurface } from "./adaptation-validation";
import { activityPlanStructureSchema } from "./structure-schema";

const ids = {
  segment: "11111111-1111-4111-8111-111111111111",
  interval: "22222222-2222-4222-8222-222222222222",
  work: "33333333-3333-4333-8333-333333333333",
  recovery: "44444444-4444-4444-8444-444444444444",
};

const structure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "bike",
  segments: [
    {
      id: ids.segment,
      name: "Main set",
      role: "activity",
      intervals: [
        {
          id: ids.interval,
          name: "VO2max intervals",
          repetitions: 4,
          steps: [
            {
              id: ids.work,
              name: "Work",
              purpose: "work",
              duration: { type: "time", seconds: 240 },
              targets: [{ type: "%FTP", intensity: 110 }],
            },
            {
              id: ids.recovery,
              name: "Recovery",
              purpose: "recovery",
              duration: { type: "time", seconds: 180 },
              targets: [{ type: "%FTP", intensity: 50 }],
            },
          ],
        },
      ],
    },
  ],
});

const adaptation = {
  controls: [
    {
      id: "55555555-5555-4555-8555-555555555551",
      key: "work_repetitions",
      label: "Work repetitions",
      kind: "interval_repetitions" as const,
      range: { minimum: 3, default: 4, maximum: 5, increment: 1 },
      targets: [
        {
          type: "interval_repetitions" as const,
          activitySegmentId: ids.segment,
          intervalId: ids.interval,
        },
      ],
    },
    {
      id: "55555555-5555-4555-8555-555555555552",
      key: "work_seconds",
      label: "Work duration",
      kind: "step_quantity" as const,
      range: { minimum: 180, default: 240, maximum: 300, increment: 60 },
      targets: [
        {
          type: "step_quantity" as const,
          activitySegmentId: ids.segment,
          intervalId: ids.interval,
          stepId: ids.work,
          quantityType: "time" as const,
        },
      ],
    },
    {
      id: "55555555-5555-4555-8555-555555555553",
      key: "recovery_seconds",
      label: "Recovery duration",
      kind: "recovery_quantity" as const,
      range: { minimum: 120, default: 180, maximum: 180, increment: 60 },
      targets: [
        {
          type: "recovery_step" as const,
          activitySegmentId: ids.segment,
          intervalId: ids.interval,
          stepId: ids.recovery,
          quantityType: "time" as const,
        },
      ],
    },
    {
      id: "55555555-5555-4555-8555-555555555554",
      key: "work_ftp_percent",
      label: "Work intensity",
      kind: "target_intensity" as const,
      range: { minimum: 105, default: 110, maximum: 115, increment: 5 },
      targets: [
        {
          type: "target_intensity" as const,
          activitySegmentId: ids.segment,
          intervalId: ids.interval,
          stepId: ids.work,
          targetType: "%FTP" as const,
        },
      ],
    },
  ],
};

describe("activity-plan semantic adaptation", () => {
  it("reproduces authored defaults and applies bounded semantic values deterministically", () => {
    const defaults = resolveActivityPlanStructure({ structure, adaptation });
    expect(defaults).toMatchObject({
      status: "resolved",
      mode: "default",
      structure,
      adaptation_values: {
        work_repetitions: 4,
        work_seconds: 240,
        recovery_seconds: 180,
        work_ftp_percent: 110,
      },
    });
    const result = resolveActivityPlanStructure({
      structure,
      adaptation,
      adaptation_values: {
        work_repetitions: 5,
        work_seconds: 300,
        recovery_seconds: 120,
        work_ftp_percent: 115,
      },
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    const interval =
      result.structure.segments[0]?.role === "activity"
        ? result.structure.segments[0].intervals[0]
        : null;
    expect(interval?.repetitions).toBe(5);
    expect(interval?.steps[0]?.duration).toEqual({ type: "time", seconds: 300 });
    expect(interval?.steps[1]?.duration).toEqual({ type: "time", seconds: 120 });
    expect(interval?.steps[0]?.targets[0]?.intensity).toBe(115);
  });

  it("rejects generic parameter registries, formula constraints, and arbitrary fields", () => {
    expect(
      activityPlanAdaptationSchema.safeParse({ parameters: [], adjustments: [] }).success,
    ).toBe(false);
    expect(activityPlanAdaptationSchema.safeParse({ ...adaptation, constraints: [] }).success).toBe(
      false,
    );
    expect(
      activityPlanAdaptationSchema.safeParse({ ...adaptation, arbitraryPath: "segments.0" })
        .success,
    ).toBe(false);
    expect(
      activityPlanAdaptationSchema.safeParse({
        controls: [
          { ...adaptation.controls[0], range: { ...adaptation.controls[0]!.range, maximum: 5.5 } },
        ],
      }).success,
    ).toBe(false);
    expect(
      activityPlanAdaptationSchema.safeParse({
        controls: [
          {
            ...adaptation.controls[1]!,
            targets: [
              adaptation.controls[1]!.targets[0]!,
              { ...adaptation.controls[1]!.targets[0]!, quantityType: "distance" },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      activityPlanAdaptationSchema.safeParse({
        ...adaptation,
        allowedStates: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            label: "Not defaults",
            values: {
              work_repetitions: 3,
              work_seconds: 180,
              recovery_seconds: 120,
              work_ftp_percent: 105,
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("fails unsupported authored targets and defaults that do not reproduce authored work", () => {
    expect(
      resolveActivityPlanStructure({
        structure,
        adaptation: {
          controls: adaptation.controls.map((control) =>
            control.key === "work_seconds"
              ? {
                  ...control,
                  targets: [
                    {
                      type: "step_quantity" as const,
                      activitySegmentId: ids.segment,
                      intervalId: ids.interval,
                      stepId: ids.recovery,
                      quantityType: "time" as const,
                    },
                  ],
                }
              : control,
          ),
        },
      }),
    ).toMatchObject({ status: "unavailable", reason: "invalid_adaptation" });
    const invalidValues: Record<string, number> = { unsupported: 1 };
    expect(
      resolveActivityPlanStructure({ structure, adaptation, adaptation_values: invalidValues }),
    ).toMatchObject({
      status: "unavailable",
      reason: "invalid_adaptation_value",
    });
  });

  it("validates every bounded semantic state against structure and intent", () => {
    expect(
      validateActivityPlanAdaptationSurface({
        structure,
        adaptation,
        intent: { training_intent: "vo2max" },
      }),
    ).toMatchObject({ status: "compatible", evaluated_states: 54 });
  });

  it("fails publication validation before allocating an unsupported adaptation surface", () => {
    expect(
      validateActivityPlanAdaptationSurface({
        structure,
        adaptation: {
          controls: [
            {
              ...adaptation.controls[0]!,
              targets: [
                {
                  type: "interval_repetitions",
                  activitySegmentId: ids.segment,
                  intervalId: "99999999-9999-4999-8999-999999999999",
                },
              ],
            },
          ],
        },
        intent: { training_intent: "vo2max" },
      }),
    ).toMatchObject({ status: "incompatible", evaluated_states: 0, reason: "invalid_adaptation" });
  });
});
