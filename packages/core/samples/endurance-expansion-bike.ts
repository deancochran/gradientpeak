import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type {
  ActivityPlanIntensityBand,
  ActivityPlanPortfolioMetadata,
} from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

type BikeFamily = {
  description: string;
  key: string;
  name: string;
  primaryIntensity: ActivityPlanIntensityBand;
  purpose: string;
  recoverySeconds?: number;
  steadyMinutes?: readonly [number, number, number, number];
  workFtp: number;
  workSeconds?: number;
  workNote: string;
};

const variants = [
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
    key: "race-build",
    label: "Race",
    repetitions: 6,
    triathlonContext: true,
  },
] as const;

const expandedBikeIds = {
  "recovery-spin": {
    foundation: "b1c00000-0001-4000-8001-000000000001",
    development: "b1c00000-0001-4000-8002-000000000002",
    advanced: "b1c00000-0001-4000-8003-000000000003",
    "race-build": "b1c00000-0001-4000-8004-000000000004",
  },
  "aerobic-durability": {
    foundation: "b1c00000-0002-4000-8001-000000000005",
    development: "b1c00000-0002-4000-8002-000000000006",
    advanced: "b1c00000-0002-4000-8003-000000000007",
    "race-build": "b1c00000-0002-4000-8004-000000000008",
  },
  "tempo-control": {
    foundation: "b1c00000-0003-4000-8001-000000000009",
    development: "b1c00000-0003-4000-8002-000000000010",
    advanced: "b1c00000-0003-4000-8003-000000000011",
    "race-build": "b1c00000-0003-4000-8004-000000000012",
  },
  "threshold-power": {
    foundation: "b1c00000-0004-4000-8001-000000000013",
    development: "b1c00000-0004-4000-8002-000000000014",
    advanced: "b1c00000-0004-4000-8003-000000000015",
    "race-build": "b1c00000-0004-4000-8004-000000000016",
  },
  "vo2-aerobic-power": {
    foundation: "b1c00000-0005-4000-8001-000000000017",
    development: "b1c00000-0005-4000-8002-000000000018",
    advanced: "b1c00000-0005-4000-8003-000000000019",
    "race-build": "b1c00000-0005-4000-8004-000000000020",
  },
  "anaerobic-repeatability": {
    foundation: "b1c00000-0006-4000-8001-000000000021",
    development: "b1c00000-0006-4000-8002-000000000022",
    advanced: "b1c00000-0006-4000-8003-000000000023",
    "race-build": "b1c00000-0006-4000-8004-000000000024",
  },
  "neuromuscular-sprints": {
    foundation: "b1c00000-0007-4000-8001-000000000025",
    development: "b1c00000-0007-4000-8002-000000000026",
    advanced: "b1c00000-0007-4000-8003-000000000027",
    "race-build": "b1c00000-0007-4000-8004-000000000028",
  },
  "cadence-endurance": {
    foundation: "b1c00000-0008-4000-8001-000000000029",
    development: "b1c00000-0008-4000-8002-000000000030",
    advanced: "b1c00000-0008-4000-8003-000000000031",
    "race-build": "b1c00000-0008-4000-8004-000000000032",
  },
} as const;

const TRIATHLON_BIKE_FAMILIES = new Set(["aerobic-durability", "cadence-endurance"]);

const families: readonly BikeFamily[] = [
  {
    description:
      "Low-stress cycling that restores movement quality while preserving aerobic rhythm.",
    key: "recovery-spin",
    name: "Recovery Spin",
    primaryIntensity: "recovery",
    purpose: "recovery",
    steadyMinutes: [25, 35, 45, 60],
    workFtp: 50,
    workNote: "Keep pressure light, cadence fluid, and breathing completely conversational.",
  },
  {
    description:
      "Steady Zone 2 riding that develops durable aerobic efficiency for long-distance cycling.",
    key: "aerobic-durability",
    name: "Aerobic Durability Ride",
    primaryIntensity: "endurance",
    purpose: "long-endurance",
    steadyMinutes: [45, 70, 100, 145],
    workFtp: 68,
    workNote: "Hold even pressure and finish with the same relaxed posture used at the start.",
  },
  {
    description:
      "Controlled tempo intervals that improve sustained power without threshold-level fatigue.",
    key: "tempo-control",
    name: "Tempo Control Intervals",
    primaryIntensity: "tempo",
    purpose: "tempo",
    recoverySeconds: 240,
    workFtp: 80,
    workSeconds: 600,
    workNote:
      "Settle quickly, keep cadence stable, and avoid power spikes at the start of each interval.",
  },
  {
    description:
      "Threshold intervals that build sustainable race power and tolerance for prolonged pressure.",
    key: "threshold-power",
    name: "Threshold Power Intervals",
    primaryIntensity: "threshold",
    purpose: "threshold",
    recoverySeconds: 240,
    workFtp: 92,
    workSeconds: 480,
    workNote:
      "Ride close to threshold with controlled breathing and repeatable power through the final interval.",
  },
  {
    description:
      "VO2 max intervals that raise aerobic power while preserving efficient pedaling under load.",
    key: "vo2-aerobic-power",
    name: "VO2 Aerobic Power",
    primaryIntensity: "vo2max",
    purpose: "vo2max",
    recoverySeconds: 240,
    workFtp: 102,
    workSeconds: 240,
    workNote:
      "Commit to the target without sprinting the opening minute; keep every repetition comparable.",
  },
  {
    description:
      "Short anaerobic efforts that develop repeatable surges for climbs, attacks, and race changes.",
    key: "anaerobic-repeatability",
    name: "Anaerobic Repeatability",
    primaryIntensity: "anaerobic",
    purpose: "anaerobic-capacity",
    recoverySeconds: 180,
    workFtp: 110,
    workSeconds: 90,
    workNote:
      "Accelerate decisively, then hold form and torque without fading through the final seconds.",
  },
  {
    description:
      "Neuromuscular sprint repetitions that develop peak cycling power with complete recovery.",
    key: "neuromuscular-sprints",
    name: "Neuromuscular Sprint Set",
    primaryIntensity: "neuromuscular",
    purpose: "sprint-power",
    recoverySeconds: 225,
    workFtp: 125,
    workSeconds: 15,
    workNote:
      "Sprint with excellent posture and fast force production; stop if power or technique deteriorates.",
  },
  {
    description:
      "Endurance blocks with deliberate cadence changes that build aerobic efficiency without relying on one steady gear.",
    key: "cadence-endurance",
    name: "Cadence Endurance Blocks",
    primaryIntensity: "endurance",
    purpose: "aerobic-cadence-efficiency",
    recoverySeconds: 180,
    workFtp: 70,
    workSeconds: 480,
    workNote:
      "Alternate one minute at 85–90 rpm with one minute at 95–100 rpm while holding even aerobic pressure.",
  },
];

function expandedBikeId(familyKey: string, variantKey: string): string {
  const familyIds = expandedBikeIds[familyKey as keyof typeof expandedBikeIds];
  const id = familyIds?.[variantKey as keyof typeof familyIds];
  if (!id) throw new Error("Unknown expanded bike-plan identity");
  return id;
}

function buildBikePlan(family: BikeFamily, variantIndex: number): SystemActivityPlanTemplate {
  const variant = variants[variantIndex];
  if (!variant) throw new Error("Missing expanded bike-plan variant");
  const identity = `expanded-bike:${family.key}:${variant.key}`;
  const triathlonContext = variant.triathlonContext && TRIATHLON_BIKE_FAMILIES.has(family.key);
  const builder = createSystemActivityPlanBuilder("bike", identity);
  const warmupMinutes = 8 + variantIndex * 3;
  const cooldownMinutes = 7 + variantIndex * 2;
  builder.warmup({
    duration: Duration.minutes(warmupMinutes),
    targets: [Target.ftp(55)],
    notes: "Build cadence gradually and confirm that the intended target is appropriate today.",
  });

  if (family.steadyMinutes) {
    const mainMinutes = family.steadyMinutes[variantIndex];
    if (!mainMinutes) throw new Error("Missing steady bike-plan duration");
    builder.step({
      duration: Duration.minutes(mainMinutes),
      intervalName: "Main Set",
      name: family.name,
      notes: family.workNote,
      targets: [Target.ftp(family.workFtp)],
    });
  } else {
    const workSeconds =
      (family.workSeconds ?? 300) +
      variantIndex *
        (family.primaryIntensity === "neuromuscular"
          ? 0
          : family.primaryIntensity === "anaerobic"
            ? 10
            : 30);
    const recoverySeconds = Math.max(90, (family.recoverySeconds ?? 180) - variantIndex * 15);
    builder.interval({
      name: family.name,
      repeat: variant.repetitions,
      steps: [
        {
          duration: Duration.seconds(workSeconds),
          name: "Work",
          notes: family.workNote,
          targets: [Target.ftp(family.workFtp)],
        },
        {
          duration: Duration.seconds(recoverySeconds),
          name: "Recovery",
          notes: "Pedal easily until breathing and movement quality are ready for the next effort.",
          targets: [Target.ftp(50)],
        },
      ],
    });
  }

  builder.cooldown({
    duration: Duration.minutes(cooldownMinutes),
    targets: [Target.ftp(50)],
    notes: "Reduce pressure progressively and finish with relaxed, smooth pedaling.",
  });

  return {
    description: `${family.description} ${variant.label} progression${triathlonContext ? " for triathlon race preparation, supporting bike-leg pacing and cadence control before the run" : ""}.`,
    gps_recording_enabled: true,
    id: expandedBikeId(family.key, variant.key),
    name: `${family.name} — ${variant.label}`,
    structure: builder.build(),
  };
}

function getBikeDurationClass(
  family: BikeFamily,
  variantIndex: number,
): ActivityPlanPortfolioMetadata["durationClass"] {
  const variant = variants[variantIndex];
  if (!variant) throw new Error("Missing expanded bike-plan variant");
  const warmupSeconds = (8 + variantIndex * 3) * 60;
  const cooldownSeconds = (7 + variantIndex * 2) * 60;
  const steadyMinutes = family.steadyMinutes?.[variantIndex];
  const workSeconds =
    (family.workSeconds ?? 300) +
    variantIndex *
      (family.primaryIntensity === "neuromuscular"
        ? 0
        : family.primaryIntensity === "anaerobic"
          ? 10
          : 30);
  const recoverySeconds = Math.max(90, (family.recoverySeconds ?? 180) - variantIndex * 15);
  const totalSeconds = steadyMinutes
    ? warmupSeconds + steadyMinutes * 60 + cooldownSeconds
    : warmupSeconds + variant.repetitions * (workSeconds + recoverySeconds) + cooldownSeconds;
  if (totalSeconds <= 3_600) return "short";
  if (totalSeconds <= 7_200) return "medium";
  return "long";
}

const allExpandedEnduranceBikeActivities = families.flatMap((family) =>
  variants.map((_, variantIndex) => buildBikePlan(family, variantIndex)),
);

/** Iconic Rønnestad plans replace this generic aerobic-power family in the registry. */
export const EXPANDED_ENDURANCE_BIKE_ACTIVITIES = allExpandedEnduranceBikeActivities.filter(
  (plan) => !plan.id?.startsWith("b1c00000-0005-"),
);

const allExpandedEnduranceBikeMetadata: ActivityPlanPortfolioMetadata[] = families.flatMap(
  (family) =>
    variants.map((variant, variantIndex) => ({
      difficulty: variant.difficulty,
      durationClass: getBikeDurationClass(family, variantIndex),
      family: `bike:${family.key}`,
      primaryIntensity: family.primaryIntensity,
      primaryPurpose: family.purpose,
      templateId: expandedBikeId(family.key, variant.key),
      triathlonContext: variant.triathlonContext && TRIATHLON_BIKE_FAMILIES.has(family.key),
    })),
);

export const EXPANDED_ENDURANCE_BIKE_METADATA = allExpandedEnduranceBikeMetadata.filter(
  (entry) => entry.family !== "bike:vo2-aerobic-power",
);
