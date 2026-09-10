import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type {
  ActivityPlanIntensityBand,
  ActivityPlanPortfolioMetadata,
} from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

type SwimFamily = {
  key: string;
  name: string;
  description: string;
  purpose: string;
  primaryIntensity: ActivityPlanIntensityBand;
  rpe: number;
  workMeters: number;
  recoverySeconds: number;
};

const levels = [
  {
    difficulty: "foundation",
    key: "foundation",
    label: "Base",
    repetitions: 3,
    triathlonContext: false,
  },
  {
    difficulty: "development",
    key: "development",
    label: "Build",
    repetitions: 4,
    triathlonContext: false,
  },
  {
    difficulty: "advanced",
    key: "advanced",
    label: "Advanced",
    repetitions: 5,
    triathlonContext: false,
  },
  {
    difficulty: "race-specific",
    key: "race",
    label: "Race",
    repetitions: 6,
    triathlonContext: true,
  },
] as const;

const swimIds = {
  "recovery-feel": {
    foundation: "d1a00000-0001-4000-8001-000000000001",
    development: "d1a00000-0001-4000-8002-000000000002",
    advanced: "d1a00000-0001-4000-8003-000000000003",
    race: "d1a00000-0001-4000-8004-000000000004",
  },
  "aerobic-continuity": {
    foundation: "d1a00000-0002-4000-8001-000000000005",
    development: "d1a00000-0002-4000-8002-000000000006",
    advanced: "d1a00000-0002-4000-8003-000000000007",
    race: "d1a00000-0002-4000-8004-000000000008",
  },
  "tempo-pull": {
    foundation: "d1a00000-0003-4000-8001-000000000009",
    development: "d1a00000-0003-4000-8002-000000000010",
    advanced: "d1a00000-0003-4000-8003-000000000011",
    race: "d1a00000-0003-4000-8004-000000000012",
  },
  "css-threshold": {
    foundation: "d1a00000-0004-4000-8001-000000000013",
    development: "d1a00000-0004-4000-8002-000000000014",
    advanced: "d1a00000-0004-4000-8003-000000000015",
    race: "d1a00000-0004-4000-8004-000000000016",
  },
  "vo2-pace": {
    foundation: "d1a00000-0005-4000-8001-000000000017",
    development: "d1a00000-0005-4000-8002-000000000018",
    advanced: "d1a00000-0005-4000-8003-000000000019",
    race: "d1a00000-0005-4000-8004-000000000020",
  },
  "anaerobic-50s": {
    foundation: "d1a00000-0006-4000-8001-000000000021",
    development: "d1a00000-0006-4000-8002-000000000022",
    advanced: "d1a00000-0006-4000-8003-000000000023",
    race: "d1a00000-0006-4000-8004-000000000024",
  },
  "neuromuscular-25s": {
    foundation: "d1a00000-0007-4000-8001-000000000025",
    development: "d1a00000-0007-4000-8002-000000000026",
    advanced: "d1a00000-0007-4000-8003-000000000027",
    race: "d1a00000-0007-4000-8004-000000000028",
  },
  "sighting-endurance": {
    foundation: "d1a00000-0008-4000-8001-000000000029",
    development: "d1a00000-0008-4000-8002-000000000030",
    advanced: "d1a00000-0008-4000-8003-000000000031",
    race: "d1a00000-0008-4000-8004-000000000032",
  },
  "tempo-negative-split": {
    foundation: "d1a00000-0009-4000-8001-000000000033",
    development: "d1a00000-0009-4000-8002-000000000034",
    advanced: "d1a00000-0009-4000-8003-000000000035",
    race: "d1a00000-0009-4000-8004-000000000036",
  },
  "threshold-descend": {
    foundation: "d1a00000-0010-4000-8001-000000000037",
    development: "d1a00000-0010-4000-8002-000000000038",
    advanced: "d1a00000-0010-4000-8003-000000000039",
    race: "d1a00000-0010-4000-8004-000000000040",
  },
} as const;

const TRIATHLON_SWIM_FAMILIES = new Set([
  "aerobic-continuity",
  "css-threshold",
  "sighting-endurance",
  "tempo-negative-split",
  "threshold-descend",
]);

const families: readonly SwimFamily[] = [
  {
    key: "recovery-feel",
    name: "Recovery Feel Swim",
    description: "Easy swimming that restores feel for the water and relaxed alignment.",
    purpose: "recovery",
    primaryIntensity: "recovery",
    rpe: 3,
    workMeters: 200,
    recoverySeconds: 30,
  },
  {
    key: "aerobic-continuity",
    name: "Aerobic Continuity Swim",
    description: "Continuous aerobic repeats that develop economical, repeatable freestyle.",
    purpose: "aerobic-durability",
    primaryIntensity: "endurance",
    rpe: 5,
    workMeters: 400,
    recoverySeconds: 30,
  },
  {
    key: "tempo-pull",
    name: "Tempo Pull Set",
    description:
      "Controlled pull buoy tempo repeats that reinforce a firm catch and steady pressure.",
    purpose: "tempo",
    primaryIntensity: "tempo",
    rpe: 6,
    workMeters: 200,
    recoverySeconds: 40,
  },
  {
    key: "css-threshold",
    name: "CSS Threshold Swim",
    description: "Critical swim speed repeats that improve sustainable race-pace control.",
    purpose: "threshold",
    primaryIntensity: "threshold",
    rpe: 7,
    workMeters: 150,
    recoverySeconds: 45,
  },
  {
    key: "vo2-pace",
    name: "VO2 Pace Swim",
    description: "Hard 100-metre repeats that raise aerobic power while preserving stroke length.",
    purpose: "vo2max",
    primaryIntensity: "vo2max",
    rpe: 8,
    workMeters: 100,
    recoverySeconds: 60,
  },
  {
    key: "anaerobic-50s",
    name: "Anaerobic 50s",
    description:
      "Short 50-metre efforts that develop repeatable speed with enough rest to protect technique.",
    purpose: "anaerobic-capacity",
    primaryIntensity: "anaerobic",
    rpe: 9,
    workMeters: 50,
    recoverySeconds: 75,
  },
  {
    key: "neuromuscular-25s",
    name: "Neuromuscular 25s",
    description:
      "Brief 25-metre accelerations that sharpen stroke timing with complete quality recovery.",
    purpose: "neuromuscular-speed",
    primaryIntensity: "neuromuscular",
    rpe: 9,
    workMeters: 25,
    recoverySeconds: 90,
  },
  {
    key: "sighting-endurance",
    name: "Sighting Endurance Swim",
    description:
      "Aerobic freestyle repeats that rehearse lifting the eyes forward every six to eight strokes without breaking body line.",
    purpose: "open-water-sighting-endurance",
    primaryIntensity: "endurance",
    rpe: 5,
    workMeters: 300,
    recoverySeconds: 25,
  },
  {
    key: "tempo-negative-split",
    name: "Tempo Negative-Split Swim",
    description:
      "Tempo repeats that finish faster than they begin, teaching controlled pressure and a patient first half.",
    purpose: "tempo-pacing-control",
    primaryIntensity: "tempo",
    rpe: 6,
    workMeters: 250,
    recoverySeconds: 35,
  },
  {
    key: "threshold-descend",
    name: "Threshold Descend Swim",
    description:
      "Threshold repeats descended across the set to improve critical-speed control while stroke mechanics remain intact.",
    purpose: "threshold-pace-control",
    primaryIntensity: "threshold",
    rpe: 7,
    workMeters: 125,
    recoverySeconds: 40,
  },
];

function getSwimId(family: SwimFamily, levelKey: (typeof levels)[number]["key"]): string {
  const id = swimIds[family.key as keyof typeof swimIds]?.[levelKey];
  if (!id) throw new Error("Missing explicit expanded swim-plan identity");
  return id;
}

function buildSwimPlan(family: SwimFamily, levelIndex: number): SystemActivityPlanTemplate {
  const level = levels[levelIndex];
  if (!level) throw new Error("Missing expanded swim-plan level");
  const triathlonContext = level.triathlonContext && TRIATHLON_SWIM_FAMILIES.has(family.key);
  const builder = createSystemActivityPlanBuilder(
    "swim",
    `expanded-swim:${family.key}:${level.key}`,
  );
  builder.warmup({
    duration: Duration.meters(300 + levelIndex * 50),
    targets: [Target.rpe(3)],
    notes: "Swim easy with drills as needed to establish a long, relaxed stroke.",
  });
  const recoverySeconds = Math.max(15, family.recoverySeconds - levelIndex * 5);
  if (family.key === "tempo-negative-split") {
    builder.interval({
      name: family.name,
      repeat: level.repetitions,
      steps: [
        {
          duration: Duration.meters(125),
          name: "Controlled First Half",
          notes: "Start patiently with long strokes and leave room to increase pressure.",
          targets: [Target.rpe(5)],
        },
        {
          duration: Duration.meters(125),
          name: "Faster Second Half",
          notes: "Increase tempo without shortening the stroke; finish faster than the first half.",
          targets: [Target.rpe(6)],
        },
        {
          duration: Duration.seconds(recoverySeconds),
          name: "Recovery",
          notes: "Rest at the wall before repeating the same negative split.",
          targets: [Target.rpe(1)],
        },
      ],
    });
  } else if (family.key === "threshold-descend") {
    for (let repeatIndex = 0; repeatIndex < level.repetitions; repeatIndex += 1) {
      const isFinalRepeat = repeatIndex === level.repetitions - 1;
      const repeatRpe = 6 + repeatIndex / (level.repetitions - 1);
      builder.interval({
        name: `${family.name} ${repeatIndex + 1}`,
        repeat: 1,
        steps: [
          {
            duration: Duration.meters(family.workMeters),
            name: `Descending Repeat ${repeatIndex + 1}`,
            notes: isFinalRepeat
              ? "Swim the fastest controlled repeat while preserving stroke length."
              : "Increase pace slightly from the prior repeat without sprinting.",
            targets: [Target.rpe(repeatRpe)],
          },
          {
            duration: Duration.seconds(recoverySeconds),
            name: "Recovery",
            notes: "Use the same rest before each progressively faster repeat.",
            targets: [Target.rpe(1)],
          },
        ],
      });
    }
  } else {
    builder.interval({
      name: family.name,
      repeat: level.repetitions,
      steps: [
        {
          duration: Duration.meters(family.workMeters),
          name: "Work",
          notes: `${family.description} Hold the prescribed effort only while stroke length and breathing remain controlled.`,
          targets: [Target.rpe(family.rpe)],
        },
        {
          duration: Duration.seconds(recoverySeconds),
          name: "Recovery",
          notes: "Rest at the wall; start the next repeat with calm breathing and deliberate form.",
          targets: [Target.rpe(1)],
        },
      ],
    });
  }
  builder.cooldown({
    duration: Duration.meters(200 + levelIndex * 50),
    targets: [Target.rpe(2)],
    notes: "Swim down easily and finish before technique degrades.",
  });
  return {
    description: `${family.description} ${level.label} progression${triathlonContext ? " for triathlon race preparation, rehearsing open-water effort control before the bike leg" : ""}.`,
    gps_recording_enabled: false,
    id: getSwimId(family, level.key),
    name: `${family.name} — ${level.label}`,
    structure: builder.build(),
  };
}

const allExpandedEnduranceSwimActivities = families.flatMap((family) =>
  levels.map((_, levelIndex) => buildSwimPlan(family, levelIndex)),
);

/** Iconic CSS plans replace the generic threshold-descend family in the registry. */
export const EXPANDED_ENDURANCE_SWIM_ACTIVITIES = allExpandedEnduranceSwimActivities.filter(
  (plan) => !plan.id?.startsWith("d1a00000-0010-"),
);

function getSwimDurationClass(
  family: SwimFamily,
  levelIndex: number,
): ActivityPlanPortfolioMetadata["durationClass"] {
  const level = levels[levelIndex];
  if (!level) throw new Error("Missing expanded swim-plan level");
  const totalMeters =
    300 + levelIndex * 50 + level.repetitions * family.workMeters + 200 + levelIndex * 50;
  if (totalMeters <= 1_500) return "short";
  if (totalMeters <= 3_000) return "medium";
  return "long";
}

const allExpandedEnduranceSwimMetadata: ActivityPlanPortfolioMetadata[] = families.flatMap(
  (family) =>
    levels.map((level, levelIndex) => ({
      difficulty: level.difficulty,
      durationClass: getSwimDurationClass(family, levelIndex),
      family: `swim:${family.key}`,
      primaryIntensity: family.primaryIntensity,
      primaryPurpose: family.purpose,
      templateId: getSwimId(family, level.key),
      triathlonContext: level.triathlonContext && TRIATHLON_SWIM_FAMILIES.has(family.key),
    })),
);

export const EXPANDED_ENDURANCE_SWIM_METADATA = allExpandedEnduranceSwimMetadata.filter(
  (entry) => entry.family !== "swim:threshold-descend",
);
