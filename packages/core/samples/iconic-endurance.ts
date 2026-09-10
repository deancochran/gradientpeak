import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type { ActivityPlanPortfolioMetadata } from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

const levels = [
  { difficulty: "foundation", label: "Foundation" },
  { difficulty: "development", label: "Development" },
  { difficulty: "advanced", label: "Advanced" },
  { difficulty: "race-specific", label: "Race" },
] as const;

const ids = {
  "norwegian-4x4": [
    "a4e10000-0001-4000-8001-000000000001",
    "a4e10000-0001-4000-8002-000000000002",
    "a4e10000-0001-4000-8003-000000000003",
    "a4e10000-0001-4000-8004-000000000004",
  ],
  "norwegian-controlled-threshold": [
    "a4e20000-0001-4000-8001-000000000005",
    "a4e20000-0001-4000-8002-000000000006",
    "a4e20000-0001-4000-8003-000000000007",
    "a4e20000-0001-4000-8004-000000000008",
  ],
  "ronnestad-30-15": [
    "a4e30000-0001-4000-8001-000000000009",
    "a4e30000-0001-4000-8002-000000000010",
    "a4e30000-0001-4000-8003-000000000011",
    "a4e30000-0001-4000-8004-000000000012",
  ],
  "css-swim": [
    "a4e40000-0001-4000-8001-000000000013",
    "a4e40000-0001-4000-8002-000000000014",
    "a4e40000-0001-4000-8003-000000000015",
    "a4e40000-0001-4000-8004-000000000016",
  ],
} as const;

const sourceNotes = {
  "norwegian-4x4":
    "Source: Helgerud et al. (2007), DOI 10.1249/mss.0b013e3180304570. The study protocol is evidence for this format, not proof that it is superior for every athlete.",
  "norwegian-controlled-threshold":
    "Source: Marius Bakken (2022/2026), https://www.mariusbakken.com/the-norwegian-model.html and https://www.mariusbakken.com/double-threshold-training.html. Practitioner examples require individual calibration, not a universal lactate target.",
  "ronnestad-30-15":
    "Source: Rønnestad et al. (2021), DOI 10.1123/ijspp.2020-0647. This is a bounded single session; do not copy the study's five-session shock microcycle without coaching supervision.",
  "css-swim":
    "Source: Wakayoshi et al. (1992), DOI 10.1055/s-2007-1021282. CSS is used here as an endurance/fatigue-threshold index; the paper did not test these exact repeat sets.",
} as const;

function iconicId(family: keyof typeof ids, levelIndex: number): string {
  const id = ids[family][levelIndex];
  if (!id) throw new Error("Missing iconic endurance plan identity");
  return id;
}

function planBase(
  category: "bike" | "run" | "swim",
  family: keyof typeof ids,
  levelIndex: number,
  name: string,
  description: string,
  build: (builder: ReturnType<typeof createSystemActivityPlanBuilder>) => void,
): SystemActivityPlanTemplate {
  const level = levels[levelIndex];
  if (!level) throw new Error("Missing iconic endurance plan level");
  const builder = createSystemActivityPlanBuilder(category, `iconic:${family}:${level.label}`);
  build(builder);
  return {
    description,
    gps_recording_enabled: category !== "swim",
    id: iconicId(family, levelIndex),
    name: `${name} — ${level.label}`,
    notes: sourceNotes[family],
    structure: builder.build(),
  };
}

const norwegian4x4 = levels.map((_, levelIndex) => {
  const repetitions = [3, 4, 5, 4][levelIndex];
  const workSeconds = 240;
  return planBase(
    "run",
    "norwegian-4x4",
    levelIndex,
    "Norwegian 4×4 Run",
    `A progressive Norwegian-style aerobic-power session. Scale by starting with fewer repetitions and keep the same controlled work and active-recovery targets; stop if form or heart-rate response becomes abnormal.${levelIndex === 3 ? " This race prep variant deliberately tapers volume while retaining the protocol." : ""}`,
    (builder) => {
      builder.warmup({ duration: Duration.minutes(12), targets: [Target.maxHR(70)] });
      builder.interval({
        name: "4×4 Aerobic Power",
        repeat: repetitions ?? 3,
        steps: [
          {
            duration: Duration.seconds(workSeconds),
            name: "Work",
            notes: "Build into 90–95% HRmax without sprinting the first minute.",
            targets: [Target.maxHR(92)],
          },
          {
            duration: Duration.seconds(levelIndex === 3 ? 210 : 180),
            name: "Active Recovery",
            notes:
              levelIndex === 3
                ? "Jog easily at about 70% HRmax for a slightly longer active recovery during this taper variant."
                : "Jog easily at about 70% HRmax; recover actively rather than standing still.",
            targets: [Target.maxHR(70)],
          },
        ],
      });
      builder.cooldown({ duration: Duration.minutes(10), targets: [Target.maxHR(65)] });
    },
  );
});

const thresholdFormats = [
  { meters: 2_000, repetitions: 3, recovery: 75 },
  { meters: 2_000, repetitions: 4, recovery: 60 },
  { meters: 2_000, repetitions: 5, recovery: 60 },
  { meters: 400, repetitions: 25, recovery: 30 },
] as const;
const norwegianThreshold = levels.map((_, levelIndex) => {
  const format = thresholdFormats[levelIndex];
  if (!format) throw new Error("Missing Norwegian threshold format");
  return planBase(
    "run",
    "norwegian-controlled-threshold",
    levelIndex,
    "Norwegian Controlled Threshold Run",
    "A single controlled sub-threshold session, progressed by repeat volume. Use an individually calibrated pace, heart-rate trend, and RPE 6–7—not a universal lactate number. Same-day pairing is an advanced coaching decision, not a routine prescription.",
    (builder) => {
      builder.warmup({ duration: Duration.minutes(15), targets: [Target.rpe(3)] });
      builder.interval({
        name: "Controlled Threshold Repeats",
        repeat: format.repetitions,
        steps: [
          {
            duration: Duration.meters(format.meters),
            name: "Controlled Work",
            notes:
              "Hold a repeatable sub-threshold effort at RPE 6–7; slow down if the individual calibration is no longer controlled.",
            targets: [Target.rpe(7)],
          },
          {
            duration: Duration.seconds(format.recovery),
            name: "Float Recovery",
            notes: "Use an easy jog float; do not turn the recovery into a full stop.",
            targets: [Target.rpe(2)],
          },
        ],
      });
      builder.cooldown({ duration: Duration.minutes(10), targets: [Target.rpe(2)] });
    },
  );
});

const ronnestadFormats = [
  { blocks: 2, repeats: 8 },
  { blocks: 3, repeats: 8 },
  { blocks: 3, repeats: 10 },
  { blocks: 5, repeats: 12 },
] as const;
const ronnestad = levels.map((_, levelIndex) => {
  const format = ronnestadFormats[levelIndex];
  if (!format) throw new Error("Missing Rønnestad format");
  return planBase(
    "bike",
    "ronnestad-30-15",
    levelIndex,
    "Rønnestad 30/15 Cycling",
    "A bounded Rønnestad-style short-interval session. Begin with fewer blocks than this progression when new to the format, and end the session if power or pedaling quality falls materially.",
    (builder) => {
      builder.warmup({ duration: Duration.minutes(15), targets: [Target.ftp(55)] });
      for (let block = 1; block <= format.blocks; block += 1) {
        builder.interval({
          name: `30/15 Block ${block}`,
          repeat: format.repeats,
          steps: [
            {
              duration: Duration.seconds(30),
              name: "30-second Work",
              notes:
                "Use a hard but repeatable aerobic-power effort; do not sprint the first repetitions.",
              targets: [Target.ftp(105)],
            },
            {
              duration: Duration.seconds(15),
              name: "15-second Recovery",
              notes: "Keep pedaling very easily through the short recovery.",
              targets: [Target.ftp(45)],
            },
          ],
        });
        if (block < format.blocks) {
          builder.step({
            duration: Duration.minutes(3),
            intervalName: "Between-set Recovery",
            name: "Between-set Recovery",
            notes: "Pedal easily for three minutes before the next 30/15 block.",
            targets: [Target.ftp(45)],
          });
        }
      }
      builder.cooldown({ duration: Duration.minutes(10), targets: [Target.ftp(50)] });
    },
  );
});

const cssRepeats = [6, 8, 10, 12] as const;
const css = levels.map((_, levelIndex) => {
  const repetitions = cssRepeats[levelIndex];
  return planBase(
    "swim",
    "css-swim",
    levelIndex,
    "Critical Swim Speed (CSS)",
    "A CSS-style repeat set with short rests. Start with fewer repeats or a slower calibrated CSS pace if stroke length or breathing deteriorates, and build only while the RPE 7 effort stays repeatable.",
    (builder) => {
      builder.warmup({ duration: Duration.meters(400), targets: [Target.rpe(3)] });
      builder.interval({
        name: "CSS Repeats",
        repeat: repetitions ?? 6,
        steps: [
          {
            duration: Duration.meters(100),
            name: "CSS Work",
            notes:
              "Swim at individually estimated CSS pace at RPE 7 with a long, repeatable stroke.",
            targets: [Target.rpe(7)],
          },
          {
            duration: Duration.seconds(15),
            name: "Short Rest",
            notes:
              "Take a short wall rest, then leave on the planned interval without rushing technique.",
            targets: [Target.rpe(1)],
          },
        ],
      });
      builder.cooldown({ duration: Duration.meters(200), targets: [Target.rpe(2)] });
    },
  );
});

export const ICONIC_ENDURANCE_ACTIVITIES: SystemActivityPlanTemplate[] = [
  ...norwegian4x4,
  ...norwegianThreshold,
  ...ronnestad,
  ...css,
];

export const ICONIC_ENDURANCE_METADATA: ActivityPlanPortfolioMetadata[] = [
  ...levels.map((level, index) => ({
    difficulty: level.difficulty,
    durationClass: "short" as const,
    family: "run:norwegian-4x4",
    primaryIntensity: "vo2max" as const,
    primaryPurpose: "aerobic-power",
    templateId: iconicId("norwegian-4x4", index),
    triathlonContext: false,
  })),
  ...levels.map((level, index) => ({
    difficulty: level.difficulty,
    durationClass: index >= 2 ? ("medium" as const) : ("short" as const),
    family: "run:norwegian-controlled-threshold",
    primaryIntensity: "threshold" as const,
    primaryPurpose: "controlled-sub-threshold",
    templateId: iconicId("norwegian-controlled-threshold", index),
    triathlonContext: false,
  })),
  ...levels.map((level, index) => ({
    difficulty: level.difficulty,
    durationClass: index === 3 ? ("medium" as const) : ("short" as const),
    family: "bike:ronnestad-30-15",
    primaryIntensity: "vo2max" as const,
    primaryPurpose: "aerobic-power",
    templateId: iconicId("ronnestad-30-15", index),
    triathlonContext: false,
  })),
  ...levels.map((level, index) => ({
    difficulty: level.difficulty,
    durationClass: index >= 2 ? ("medium" as const) : ("short" as const),
    family: "swim:css-swim",
    primaryIntensity: "threshold" as const,
    primaryPurpose: "critical-swim-speed",
    templateId: iconicId("css-swim", index),
    triathlonContext: false,
  })),
];
