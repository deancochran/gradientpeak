import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type { ActivityPlanPortfolioMetadata } from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

const sourceNotes = {
  norwegian:
    "Source: Marius Bakken (2022/2026), https://www.mariusbakken.com/the-norwegian-model.html and https://www.mariusbakken.com/double-threshold-training.html. Practitioner examples require individual calibration, not a universal lactate target.",
  css: "Source: Wakayoshi et al. (1992), DOI 10.1055/s-2007-1021282. CSS is used here as an endurance/fatigue-threshold index; the paper did not test these exact repeat sets.",
} as const;
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
        notes: "Build into 90–95% HRmax without sprinting the first minute.",
        targets: [Target.maxHR(90)],
      },
      {
        duration: Duration.seconds(180),
        name: "Active Recovery",
        notes: "Jog easily at about 70% HRmax; recover actively rather than standing still.",
        targets: [Target.maxHR(70)],
      },
    ],
  });
  const structure = builder
    .cooldown({ duration: Duration.minutes(10), targets: [Target.maxHR(65)] })
    .build();
  return {
    id: "a4e10000-0001-4000-8001-000000000001",
    name: "Norwegian 4×4 Run",
    description:
      "A controlled Norwegian-style aerobic-power session with bounded repeat and active-recovery states.",
    notes:
      "Source: Helgerud et al. (2007), DOI 10.1249/mss.0b013e3180304570. The study protocol is evidence for this format, not proof that it is superior for every athlete.",
    gps_recording_enabled: true,
    structure,
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
        notes:
          "Hold a repeatable sub-threshold effort at RPE 6–7; slow down if the individual calibration is no longer controlled.",
        targets: [Target.rpe(7)],
      },
      {
        duration: Duration.seconds(60),
        name: "Float Recovery",
        notes: "Use an easy jog float; do not turn the recovery into a full stop.",
        targets: [Target.rpe(2)],
      },
    ],
  });
  const structure = builder
    .cooldown({ duration: Duration.minutes(10), targets: [Target.rpe(2)] })
    .build();
  return {
    id: "a4e20000-0001-4000-8001-000000000005",
    name: "Norwegian Controlled Threshold Long Repeats",
    description:
      "A controlled sub-threshold long-repeat session with coordinated volume and float-recovery states.",
    notes: sourceNotes.norwegian,
    gps_recording_enabled: true,
    structure,
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
        notes:
          "Hold a repeatable sub-threshold RPE 6–7; this distinct short-repeat protocol is not a long-repeat dose state.",
        targets: [Target.rpe(7)],
      },
      {
        duration: Duration.seconds(30),
        name: "Float Recovery",
        notes: "Use an easy jog float between controlled repeats.",
        targets: [Target.rpe(2)],
      },
    ],
  });
  const structure = builder
    .cooldown({ duration: Duration.minutes(10), targets: [Target.rpe(2)] })
    .build();
  return {
    id: "a4e20000-0001-4000-8004-000000000008",
    name: "Norwegian 25×400 Controlled Threshold",
    description: "A separately identified 25-by-400-metre Norwegian controlled-threshold protocol.",
    notes: sourceNotes.norwegian,
    gps_recording_enabled: true,
    structure,
  };
}
function css(): SystemActivityPlanTemplate {
  const identity = "iconic:css-swim";
  const builder = createSystemActivityPlanBuilder("swim", identity);
  builder.warmup({
    duration: Duration.meters(400),
    targets: [Target.rpe(3)],
    notes: "Swim easy freestyle and finish with a long, relaxed stroke.",
  });
  builder.interval({
    name: "CSS Repeats",
    repeat: 8,
    steps: [
      {
        duration: Duration.meters(100),
        name: "CSS Work",
        notes: "Swim at individually estimated CSS pace at RPE 7 with a long, repeatable stroke.",
        targets: [Target.rpe(7)],
      },
      {
        duration: Duration.seconds(15),
        name: "Short Rest",
        notes:
          "Take a short wall rest, then leave on the planned interval without rushing technique.",
        targets: [{ type: "rest" }],
      },
    ],
  });
  const structure = builder
    .cooldown({
      duration: Duration.meters(200),
      targets: [Target.rpe(2)],
      notes: "Swim down easy freestyle or backstroke.",
    })
    .build();
  return {
    id: "a4e40000-0001-4000-8001-000000000013",
    name: "Critical Swim Speed (CSS)",
    description: "A CSS-style repeat set with bounded repeat-volume states.",
    notes: sourceNotes.css,
    gps_recording_enabled: false,
    structure,
  };
}
export const ICONIC_ENDURANCE_ACTIVITIES: SystemActivityPlanTemplate[] = [
  norwegian4x4(),
  norwegianLongRepeats(),
  norwegian25x400(),
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
    durationClass: "short",
    family: "swim:css-swim",
    primaryIntensity: "threshold",
    primaryPurpose: "critical-swim-speed",
    templateId: "a4e40000-0001-4000-8001-000000000013",
    triathlonContext: false,
  },
];
