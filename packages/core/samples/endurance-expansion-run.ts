import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type {
  ActivityPlanIntensityBand,
  ActivityPlanPortfolioMetadata,
} from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

type RunFamily = {
  key: string;
  name: string;
  description: string;
  purpose: string;
  primaryIntensity: ActivityPlanIntensityBand;
  rpe: number;
  workSeconds: number;
  recoverySeconds: number;
};

const levels = [
  {
    difficulty: "foundation",
    idSuffix: "01",
    key: "foundation",
    label: "Base",
    repetitions: 3,
    triathlonContext: false,
  },
  {
    difficulty: "development",
    idSuffix: "02",
    key: "development",
    label: "Build",
    repetitions: 4,
    triathlonContext: false,
  },
  {
    difficulty: "advanced",
    idSuffix: "03",
    key: "advanced",
    label: "Advanced",
    repetitions: 5,
    triathlonContext: false,
  },
  {
    difficulty: "race-specific",
    idSuffix: "04",
    key: "race",
    label: "Race",
    repetitions: 6,
    triathlonContext: true,
  },
] as const;

const runIds = {
  "easy-reset": {
    foundation: "c1a00000-0001-4000-8001-000000000001",
    development: "c1a00000-0001-4000-8002-000000000002",
    advanced: "c1a00000-0001-4000-8003-000000000003",
    race: "c1a00000-0001-4000-8004-000000000004",
  },
  "aerobic-long-run": {
    foundation: "c1a00000-0002-4000-8001-000000000005",
    development: "c1a00000-0002-4000-8002-000000000006",
    advanced: "c1a00000-0002-4000-8003-000000000007",
    race: "c1a00000-0002-4000-8004-000000000008",
  },
  "cruise-tempo": {
    foundation: "c1a00000-0003-4000-8001-000000000009",
    development: "c1a00000-0003-4000-8002-000000000010",
    advanced: "c1a00000-0003-4000-8003-000000000011",
    race: "c1a00000-0003-4000-8004-000000000012",
  },
  "lactate-threshold": {
    foundation: "c1a00000-0004-4000-8001-000000000013",
    development: "c1a00000-0004-4000-8002-000000000014",
    advanced: "c1a00000-0004-4000-8003-000000000015",
    race: "c1a00000-0004-4000-8004-000000000016",
  },
  "vo2-hill": {
    foundation: "c1a00000-0005-4000-8001-000000000017",
    development: "c1a00000-0005-4000-8002-000000000018",
    advanced: "c1a00000-0005-4000-8003-000000000019",
    race: "c1a00000-0005-4000-8004-000000000020",
  },
  "anaerobic-hill": {
    foundation: "c1a00000-0006-4000-8001-000000000021",
    development: "c1a00000-0006-4000-8002-000000000022",
    advanced: "c1a00000-0006-4000-8003-000000000023",
    race: "c1a00000-0006-4000-8004-000000000024",
  },
  "stride-speed": {
    foundation: "c1a00000-0007-4000-8001-000000000025",
    development: "c1a00000-0007-4000-8002-000000000026",
    advanced: "c1a00000-0007-4000-8003-000000000027",
    race: "c1a00000-0007-4000-8004-000000000028",
  },
} as const;

const TRIATHLON_RUN_FAMILIES = new Set(["aerobic-long-run", "cruise-tempo", "lactate-threshold"]);

const families: readonly RunFamily[] = [
  {
    key: "easy-reset",
    name: "Easy Reset Run",
    description:
      "Conversational running that restores rhythm with deliberately low mechanical stress.",
    purpose: "recovery",
    primaryIntensity: "recovery",
    rpe: 3,
    workSeconds: 900,
    recoverySeconds: 0,
  },
  {
    key: "aerobic-long-run",
    name: "Aerobic Long Run",
    description: "Steady aerobic running that builds durable, economical time on feet.",
    purpose: "aerobic-durability",
    primaryIntensity: "endurance",
    rpe: 5,
    workSeconds: 4500,
    recoverySeconds: 0,
  },
  {
    key: "cruise-tempo",
    name: "Cruise Tempo Run",
    description:
      "Controlled tempo repetitions that develop sustainable speed below threshold strain.",
    purpose: "tempo",
    primaryIntensity: "tempo",
    rpe: 6,
    workSeconds: 480,
    recoverySeconds: 180,
  },
  {
    key: "lactate-threshold",
    name: "Lactate Threshold Run",
    description: "Threshold repetitions that improve pace control while fatigue is accumulating.",
    purpose: "threshold",
    primaryIntensity: "threshold",
    rpe: 7,
    workSeconds: 360,
    recoverySeconds: 150,
  },
  {
    key: "vo2-hill",
    name: "VO2 Hill Repeats",
    description:
      "Uphill VO2 efforts that raise aerobic power without requiring reckless downhill speed.",
    purpose: "vo2max",
    primaryIntensity: "vo2max",
    rpe: 8,
    workSeconds: 150,
    recoverySeconds: 180,
  },
  {
    key: "anaerobic-hill",
    name: "Anaerobic Hill Surges",
    description:
      "Short hill surges that develop repeatable anaerobic power with full form-focused recovery.",
    purpose: "anaerobic-capacity",
    primaryIntensity: "anaerobic",
    rpe: 9,
    workSeconds: 45,
    recoverySeconds: 135,
  },
  {
    key: "stride-speed",
    name: "Neuromuscular Strides",
    description:
      "Brief relaxed strides that sharpen coordination and leg speed without accumulating lactate.",
    purpose: "neuromuscular-speed",
    primaryIntensity: "neuromuscular",
    rpe: 9,
    workSeconds: 20,
    recoverySeconds: 100,
  },
];

function getRunId(family: RunFamily, levelKey: (typeof levels)[number]["key"]): string {
  const id = runIds[family.key as keyof typeof runIds]?.[levelKey];
  if (!id) throw new Error("Missing explicit expanded run-plan identity");
  return id;
}

function buildRunPlan(family: RunFamily, levelIndex: number): SystemActivityPlanTemplate {
  const level = levels[levelIndex];
  if (!level) throw new Error("Missing expanded run-plan level");
  const triathlonContext = level.triathlonContext && TRIATHLON_RUN_FAMILIES.has(family.key);
  const builder = createSystemActivityPlanBuilder("run", `expanded-run:${family.key}:${level.key}`);
  builder.warmup({
    duration: Duration.minutes(10 + levelIndex * 2),
    targets: [Target.rpe(3)],
    notes: "Jog easily and include mobility drills before faster running.",
  });
  const workSeconds =
    family.workSeconds +
    (family.primaryIntensity === "anaerobic" || family.primaryIntensity === "neuromuscular"
      ? 0
      : levelIndex * 30);
  if (family.recoverySeconds === 0) {
    builder.step({
      duration: Duration.seconds(workSeconds + levelIndex * 300),
      intervalName: "Main Set",
      name: family.name,
      notes: "Keep breathing controlled and stop early if gait changes.",
      targets: [Target.rpe(family.rpe)],
    });
  } else {
    builder.interval({
      name: family.name,
      repeat: level.repetitions,
      steps: [
        {
          duration: Duration.seconds(workSeconds),
          name: "Work",
          notes: `${family.description} Run tall and controlled; preserve the same mechanics through every repetition.`,
          targets: [Target.rpe(family.rpe)],
        },
        {
          duration: Duration.seconds(Math.max(75, family.recoverySeconds - levelIndex * 10)),
          name: "Recovery",
          notes: "Walk or jog easily until breathing and form are ready for the next effort.",
          targets: [Target.rpe(2)],
        },
      ],
    });
  }
  builder.cooldown({
    duration: Duration.minutes(8 + levelIndex * 2),
    targets: [Target.rpe(2)],
    notes: "Jog easily, then walk until breathing settles.",
  });
  return {
    description: `${family.description} ${level.label} progression${triathlonContext ? " for triathlon race preparation, supporting run-leg pacing and race-week readiness" : ""}.`,
    gps_recording_enabled: true,
    id: getRunId(family, level.key),
    name: `${family.name} — ${level.label}`,
    structure: builder.build(),
  };
}

const allExpandedEnduranceRunActivities = families.flatMap((family) =>
  levels.map((_, levelIndex) => buildRunPlan(family, levelIndex)),
);

/** Iconic Norwegian plans replace the generic threshold and hill-VO2 families in the registry. */
export const EXPANDED_ENDURANCE_RUN_ACTIVITIES = allExpandedEnduranceRunActivities.filter(
  (plan) => !plan.id?.startsWith("c1a00000-0004-") && !plan.id?.startsWith("c1a00000-0005-"),
);

function getRunDurationClass(
  family: RunFamily,
  levelIndex: number,
): ActivityPlanPortfolioMetadata["durationClass"] {
  const level = levels[levelIndex];
  if (!level) throw new Error("Missing expanded run-plan level");
  const warmupSeconds = (10 + levelIndex * 2) * 60;
  const cooldownSeconds = (8 + levelIndex * 2) * 60;
  const workSeconds =
    family.workSeconds +
    (family.primaryIntensity === "anaerobic" || family.primaryIntensity === "neuromuscular"
      ? 0
      : levelIndex * 30);
  const mainSeconds =
    family.recoverySeconds === 0
      ? workSeconds + levelIndex * 300
      : level.repetitions * (workSeconds + Math.max(75, family.recoverySeconds - levelIndex * 10));
  const totalSeconds = warmupSeconds + mainSeconds + cooldownSeconds;
  if (totalSeconds <= 3_600) return "short";
  if (totalSeconds <= 7_200) return "medium";
  return "long";
}

const allExpandedEnduranceRunMetadata: ActivityPlanPortfolioMetadata[] = families.flatMap(
  (family) =>
    levels.map((level, levelIndex) => ({
      difficulty: level.difficulty,
      durationClass: getRunDurationClass(family, levelIndex),
      family: `run:${family.key}`,
      primaryIntensity: family.primaryIntensity,
      primaryPurpose: family.purpose,
      templateId: getRunId(family, level.key),
      triathlonContext: level.triathlonContext && TRIATHLON_RUN_FAMILIES.has(family.key),
    })),
);

export const EXPANDED_ENDURANCE_RUN_METADATA = allExpandedEnduranceRunMetadata.filter(
  (entry) => entry.family !== "run:lactate-threshold" && entry.family !== "run:vo2-hill",
);
