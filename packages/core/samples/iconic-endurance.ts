import { Duration, Target } from "../schemas/activity_payload";
import {
  createSystemActivityPlanAdaptationBuilder,
  createSystemActivityPlanBuilder,
  requiredSampleItem,
} from "./activity-plan-builder";
import type { ActivityPlanPortfolioMetadata } from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

const sourceNotes = {
  norwegian:
    "Source: Marius Bakken (2022/2026), https://www.mariusbakken.com/the-norwegian-model.html and https://www.mariusbakken.com/double-threshold-training.html. Practitioner examples require individual calibration, not a universal lactate target.",
  ronnestad:
    "Source: Rønnestad et al. (2021), DOI 10.1123/ijspp.2020-0647. This is a bounded single session; do not copy the study's five-session shock microcycle without coaching supervision.",
  css: "Source: Wakayoshi et al. (1992), DOI 10.1055/s-2007-1021282. CSS is used here as an endurance/fatigue-threshold index; the paper did not test these exact repeat sets.",
} as const;
function activitySegment(
  structure: ReturnType<ReturnType<typeof createSystemActivityPlanBuilder>["build"]>,
) {
  const segment = structure.segments[0];
  if (segment?.role !== "activity") throw new Error("Expected iconic activity segment");
  return segment;
}

function norwegian4x4(): SystemActivityPlanTemplate {
  const identity = "iconic:norwegian-4x4";
  const builder = createSystemActivityPlanBuilder("run", identity);
  builder.warmup({ duration: Duration.minutes(12), targets: [Target.maxHR(70)] });
  builder.interval({
    name: "4×4 Aerobic Power",
    repeat: 4,
    steps: [
      {
        duration: Duration.seconds(240),
        name: "Work",
        purpose: "work",
        notes: "Build into 90–95% HRmax without sprinting the first minute.",
        targets: [Target.maxHR(92)],
      },
      {
        duration: Duration.seconds(180),
        name: "Active Recovery",
        purpose: "recovery",
        notes: "Jog easily at about 70% HRmax; recover actively rather than standing still.",
        targets: [Target.maxHR(70)],
      },
    ],
  });
  const structure = builder
    .cooldown({ duration: Duration.minutes(10), targets: [Target.maxHR(65)] })
    .build();
  const segment = activitySegment(structure);
  const interval = requiredSampleItem(segment.intervals, 1, "Norwegian 4x4 work interval");
  const recovery = requiredSampleItem(interval.steps, 1, "Norwegian 4x4 recovery step");
  const adaptation = createSystemActivityPlanAdaptationBuilder(identity);
  return {
    id: "a4e10000-0001-4000-8001-000000000001",
    name: "Norwegian 4×4 Run",
    description:
      "A controlled Norwegian-style aerobic-power session with bounded repeat and active-recovery states.",
    notes:
      "Source: Helgerud et al. (2007), DOI 10.1249/mss.0b013e3180304570. The study protocol is evidence for this format, not proof that it is superior for every athlete.",
    gps_recording_enabled: true,
    structure,
    adaptation: {
      controls: [
        adaptation.control({
          key: "work_repetitions",
          label: "Work repetitions",
          kind: "interval_repetitions",
          range: { minimum: 3, default: 4, maximum: 5, increment: 1 },
          targets: [
            {
              type: "interval_repetitions",
              activitySegmentId: segment.id,
              intervalId: interval.id,
            },
          ],
        }),
        adaptation.control({
          key: "recovery_seconds",
          label: "Active recovery",
          kind: "recovery_quantity",
          range: { minimum: 180, default: 180, maximum: 210, increment: 30 },
          targets: [
            {
              type: "recovery_step",
              activitySegmentId: segment.id,
              intervalId: interval.id,
              stepId: recovery.id,
              quantityType: "time",
            },
          ],
        }),
      ],
      allowedStates: [
        adaptation.state({
          label: "Foundation",
          values: { work_repetitions: 3, recovery_seconds: 180 },
        }),
        adaptation.state({
          label: "Development",
          values: { work_repetitions: 4, recovery_seconds: 180 },
        }),
        adaptation.state({
          label: "Advanced",
          values: { work_repetitions: 5, recovery_seconds: 180 },
        }),
        adaptation.state({
          label: "Race taper",
          values: { work_repetitions: 4, recovery_seconds: 210 },
        }),
      ],
    },
  };
}
function norwegianLongRepeats(): SystemActivityPlanTemplate {
  const identity = "iconic:norwegian-controlled-threshold";
  const builder = createSystemActivityPlanBuilder("run", identity);
  builder.warmup({ duration: Duration.minutes(15), targets: [Target.rpe(3)] });
  builder.interval({
    name: "Controlled Threshold Repeats",
    repeat: 4,
    steps: [
      {
        duration: Duration.meters(2_000),
        name: "Controlled Work",
        purpose: "work",
        notes:
          "Hold a repeatable sub-threshold effort at RPE 6–7; slow down if the individual calibration is no longer controlled.",
        targets: [Target.rpe(7)],
      },
      {
        duration: Duration.seconds(60),
        name: "Float Recovery",
        purpose: "recovery",
        notes: "Use an easy jog float; do not turn the recovery into a full stop.",
        targets: [Target.rpe(2)],
      },
    ],
  });
  const structure = builder
    .cooldown({ duration: Duration.minutes(10), targets: [Target.rpe(2)] })
    .build();
  const segment = activitySegment(structure);
  const interval = requiredSampleItem(segment.intervals, 1, "Norwegian threshold interval");
  const recovery = requiredSampleItem(interval.steps, 1, "Norwegian threshold recovery step");
  const adaptation = createSystemActivityPlanAdaptationBuilder(identity);
  return {
    id: "a4e20000-0001-4000-8001-000000000005",
    name: "Norwegian Controlled Threshold Long Repeats",
    description:
      "A controlled sub-threshold long-repeat session with coordinated volume and float-recovery states.",
    notes: sourceNotes.norwegian,
    gps_recording_enabled: true,
    structure,
    adaptation: {
      controls: [
        adaptation.control({
          key: "work_repetitions",
          label: "Long-repeat count",
          kind: "interval_repetitions",
          range: { minimum: 3, default: 4, maximum: 5, increment: 1 },
          targets: [
            {
              type: "interval_repetitions",
              activitySegmentId: segment.id,
              intervalId: interval.id,
            },
          ],
        }),
        adaptation.control({
          key: "recovery_seconds",
          label: "Float recovery",
          kind: "recovery_quantity",
          range: { minimum: 60, default: 60, maximum: 75, increment: 15 },
          targets: [
            {
              type: "recovery_step",
              activitySegmentId: segment.id,
              intervalId: interval.id,
              stepId: recovery.id,
              quantityType: "time",
            },
          ],
        }),
      ],
      allowedStates: [
        adaptation.state({
          label: "Foundation",
          values: { work_repetitions: 3, recovery_seconds: 75 },
        }),
        adaptation.state({
          label: "Development",
          values: { work_repetitions: 4, recovery_seconds: 60 },
        }),
        adaptation.state({
          label: "Advanced",
          values: { work_repetitions: 5, recovery_seconds: 60 },
        }),
      ],
    },
  };
}
function norwegian25x400(): SystemActivityPlanTemplate {
  const identity = "iconic:norwegian-25x400";
  const builder = createSystemActivityPlanBuilder("run", identity);
  builder.warmup({ duration: Duration.minutes(15), targets: [Target.rpe(3)] });
  builder.interval({
    name: "25×400 Controlled Threshold",
    repeat: 25,
    steps: [
      {
        duration: Duration.meters(400),
        name: "Controlled Work",
        purpose: "work",
        notes:
          "Hold a repeatable sub-threshold RPE 6–7; this distinct short-repeat protocol is not a long-repeat dose state.",
        targets: [Target.rpe(7)],
      },
      {
        duration: Duration.seconds(30),
        name: "Float Recovery",
        purpose: "recovery",
        notes: "Use an easy jog float between controlled repeats.",
        targets: [Target.rpe(2)],
      },
    ],
  });
  const structure = builder
    .cooldown({ duration: Duration.minutes(10), targets: [Target.rpe(2)] })
    .build();
  const segment = activitySegment(structure);
  const interval = requiredSampleItem(segment.intervals, 1, "Norwegian 25x400 interval");
  const recovery = requiredSampleItem(interval.steps, 1, "Norwegian 25x400 recovery step");
  const adaptation = createSystemActivityPlanAdaptationBuilder(identity);
  return {
    id: "a4e20000-0001-4000-8004-000000000008",
    name: "Norwegian 25×400 Controlled Threshold",
    description: "A separately identified 25-by-400-metre Norwegian controlled-threshold protocol.",
    notes: sourceNotes.norwegian,
    gps_recording_enabled: true,
    structure,
    adaptation: {
      controls: [
        adaptation.control({
          key: "float_recovery_seconds",
          label: "Float recovery",
          kind: "recovery_quantity",
          range: { minimum: 20, default: 30, maximum: 40, increment: 10 },
          targets: [
            {
              type: "recovery_step",
              activitySegmentId: segment.id,
              intervalId: interval.id,
              stepId: recovery.id,
              quantityType: "time",
            },
          ],
        }),
      ],
    },
  };
}
function ronnestad(): SystemActivityPlanTemplate {
  const identity = "iconic:ronnestad-30-15";
  const builder = createSystemActivityPlanBuilder("bike", identity);
  builder.warmup({ duration: Duration.minutes(15), targets: [Target.ftp(55)] });
  for (let block = 1; block <= 5; block += 1) {
    builder.interval({
      name: `30/15 Block ${block}`,
      repeat: block <= 3 ? 10 : 1,
      steps: [
        {
          duration: Duration.seconds(30),
          name: "30-second Work",
          purpose: "work",
          notes:
            "Use a hard but repeatable aerobic-power effort; do not sprint the first repetitions.",
          targets: [Target.ftp(105)],
        },
        {
          duration: Duration.seconds(15),
          name: "15-second Recovery",
          purpose: "recovery",
          notes: "Keep pedaling very easily through the short recovery.",
          targets: [Target.ftp(45)],
        },
      ],
    });
    if (block < 5)
      builder.rest({
        duration: Duration.minutes(3),
        name: "Between-set Recovery",
        notes: "Pedal easily for three minutes before the next 30/15 block.",
      });
  }
  const structure = builder
    .cooldown({ duration: Duration.minutes(10), targets: [Target.ftp(50)] })
    .build();
  const segment = activitySegment(structure);
  const blocks = [
    requiredSampleItem(segment.intervals, 1, "Rønnestad work interval 1"),
    requiredSampleItem(segment.intervals, 3, "Rønnestad work interval 2"),
    requiredSampleItem(segment.intervals, 5, "Rønnestad work interval 3"),
    requiredSampleItem(segment.intervals, 7, "Rønnestad work interval 4"),
    requiredSampleItem(segment.intervals, 9, "Rønnestad work interval 5"),
  ];
  const adaptation = createSystemActivityPlanAdaptationBuilder(identity);
  const controls = blocks.map((interval, index) =>
    adaptation.control({
      key: `block_${index + 1}_repetitions`,
      label: `Block ${index + 1} repetitions`,
      kind: "interval_repetitions",
      range: { minimum: 1, default: interval.repetitions, maximum: 12, increment: 1 },
      targets: [
        { type: "interval_repetitions", activitySegmentId: segment.id, intervalId: interval.id },
      ],
    }),
  );
  const values = (counts: readonly number[]) =>
    Object.fromEntries(counts.map((count, index) => [`block_${index + 1}_repetitions`, count]));
  return {
    id: "a4e30000-0001-4000-8001-000000000009",
    name: "Rønnestad 30/15 Cycling",
    description:
      "A bounded Rønnestad-style short-interval session with coordinated block and repetition states.",
    notes: sourceNotes.ronnestad,
    gps_recording_enabled: true,
    structure,
    adaptation: {
      controls,
      allowedStates: [
        adaptation.state({ label: "Foundation", values: values([8, 8, 1, 1, 1]) }),
        adaptation.state({ label: "Development", values: values([8, 8, 8, 1, 1]) }),
        adaptation.state({ label: "Advanced", values: values([10, 10, 10, 1, 1]) }),
        adaptation.state({ label: "Race", values: values([12, 12, 12, 12, 12]) }),
      ],
    },
  };
}
function css(): SystemActivityPlanTemplate {
  const identity = "iconic:css-swim";
  const builder = createSystemActivityPlanBuilder("swim", identity);
  builder.warmup({ duration: Duration.meters(400), targets: [Target.rpe(3)] });
  builder.interval({
    name: "CSS Repeats",
    repeat: 8,
    steps: [
      {
        duration: Duration.meters(100),
        name: "CSS Work",
        purpose: "work",
        notes: "Swim at individually estimated CSS pace at RPE 7 with a long, repeatable stroke.",
        targets: [Target.rpe(7)],
      },
      {
        duration: Duration.seconds(15),
        name: "Short Rest",
        purpose: "recovery",
        notes:
          "Take a short wall rest, then leave on the planned interval without rushing technique.",
        targets: [Target.rpe(1)],
      },
    ],
  });
  const structure = builder
    .cooldown({ duration: Duration.meters(200), targets: [Target.rpe(2)] })
    .build();
  const segment = activitySegment(structure);
  const interval = requiredSampleItem(segment.intervals, 1, "CSS work interval");
  const adaptation = createSystemActivityPlanAdaptationBuilder(identity);
  return {
    id: "a4e40000-0001-4000-8001-000000000013",
    name: "Critical Swim Speed (CSS)",
    description: "A CSS-style repeat set with bounded repeat-volume states.",
    notes: sourceNotes.css,
    gps_recording_enabled: false,
    structure,
    adaptation: {
      controls: [
        adaptation.control({
          key: "work_repetitions",
          label: "CSS repeat count",
          kind: "interval_repetitions",
          range: { minimum: 6, default: 8, maximum: 12, increment: 1 },
          targets: [
            {
              type: "interval_repetitions",
              activitySegmentId: segment.id,
              intervalId: interval.id,
            },
          ],
        }),
      ],
      allowedStates: [6, 8, 10, 12].map((value) =>
        adaptation.state({ label: `${value} repeats`, values: { work_repetitions: value } }),
      ),
    },
  };
}
export const ICONIC_ENDURANCE_ACTIVITIES: SystemActivityPlanTemplate[] = [
  norwegian4x4(),
  norwegianLongRepeats(),
  norwegian25x400(),
  ronnestad(),
  css(),
];
export const ICONIC_ENDURANCE_METADATA: ActivityPlanPortfolioMetadata[] = [
  {
    difficulty: "development",
    durationClass: "short",
    family: "run:norwegian-4x4",
    primaryIntensity: "vo2max",
    primaryPurpose: "aerobic-power",
    templateId: "a4e10000-0001-4000-8001-000000000001",
    triathlonContext: false,
  },
  {
    difficulty: "development",
    durationClass: "short",
    family: "run:norwegian-controlled-threshold",
    primaryIntensity: "threshold",
    primaryPurpose: "controlled-sub-threshold",
    templateId: "a4e20000-0001-4000-8001-000000000005",
    triathlonContext: false,
  },
  {
    difficulty: "race-specific",
    durationClass: "medium",
    family: "run:norwegian-25x400",
    primaryIntensity: "threshold",
    primaryPurpose: "controlled-sub-threshold",
    templateId: "a4e20000-0001-4000-8004-000000000008",
    triathlonContext: false,
  },
  {
    difficulty: "development",
    durationClass: "medium",
    family: "bike:ronnestad-30-15",
    primaryIntensity: "vo2max",
    primaryPurpose: "aerobic-power",
    templateId: "a4e30000-0001-4000-8001-000000000009",
    triathlonContext: false,
  },
  {
    difficulty: "development",
    durationClass: "short",
    family: "swim:css-swim",
    primaryIntensity: "threshold",
    primaryPurpose: "critical-swim-speed",
    templateId: "a4e40000-0001-4000-8001-000000000013",
    triathlonContext: false,
  },
];
