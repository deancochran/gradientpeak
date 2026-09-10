import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type {
  ActivityPlanIntensityBand,
  ActivityPlanPortfolioMetadata,
} from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

const levels = [
  { difficulty: "foundation", label: "Foundation", triathlonContext: false },
  { difficulty: "development", label: "Build", triathlonContext: false },
  { difficulty: "advanced", label: "Advanced", triathlonContext: false },
  { difficulty: "race-specific", label: "Race Prep", triathlonContext: false },
] as const;

type OtherFamily = {
  description: string;
  ids: readonly [string, string, string, string];
  intensity: ActivityPlanIntensityBand;
  key: string;
  mainName: string;
  mainNotes: string;
  mainRpe: 3 | 4 | 5 | 6 | 7;
  mainMinutes: readonly [number, number, number, number];
  name: string;
  purpose: string;
};

const families: readonly OtherFamily[] = [
  {
    description:
      "Gentle mobility and breathing reset restores comfortable movement after training.",
    ids: [
      "f2a00000-0001-4000-8001-000000000001",
      "f2a00000-0001-4000-8002-000000000002",
      "f2a00000-0001-4000-8003-000000000003",
      "f2a00000-0001-4000-8004-000000000004",
    ],
    intensity: "recovery",
    key: "mobility-reset",
    mainName: "Mobility Flow",
    mainNotes: "Move through hips, thoracic spine, ankles, and shoulders without forcing range.",
    mainRpe: 3,
    mainMinutes: [12, 18, 24, 16],
    name: "Mobility Reset",
    purpose: "active-recovery",
  },
  {
    description:
      "A balance-focused yoga flow builds controlled positions, breathing, and relaxed mobility.",
    ids: [
      "f2a00000-0002-4000-8001-000000000005",
      "f2a00000-0002-4000-8002-000000000006",
      "f2a00000-0002-4000-8003-000000000007",
      "f2a00000-0002-4000-8004-000000000008",
    ],
    intensity: "endurance",
    key: "yoga-balance",
    mainName: "Balance Flow",
    mainNotes: "Use a wall or block as needed and keep the breath smooth in each position.",
    mainRpe: 4,
    mainMinutes: [20, 30, 40, 25],
    name: "Yoga Balance Flow",
    purpose: "mobility-and-balance",
  },
  {
    description:
      "Rowing-erg technique intervals provide low-impact cross-training with repeatable rhythm.",
    ids: [
      "f2a00000-0003-4000-8001-000000000009",
      "f2a00000-0003-4000-8002-000000000010",
      "f2a00000-0003-4000-8003-000000000011",
      "f2a00000-0003-4000-8004-000000000012",
    ],
    intensity: "tempo",
    key: "row-technique",
    mainName: "Technique Row",
    mainNotes:
      "Sequence legs, body, then arms; reduce pace if stroke length or rhythm breaks down.",
    mainRpe: 6,
    mainMinutes: [16, 24, 32, 20],
    name: "Rowing Technique Tempo",
    purpose: "low-impact-tempo",
  },
  {
    description: "Elliptical endurance develops aerobic volume without impact from running.",
    ids: [
      "f2a00000-0004-4000-8001-000000000013",
      "f2a00000-0004-4000-8002-000000000014",
      "f2a00000-0004-4000-8003-000000000015",
      "f2a00000-0004-4000-8004-000000000016",
    ],
    intensity: "endurance",
    key: "elliptical-endurance",
    mainName: "Steady Elliptical",
    mainNotes:
      "Maintain relaxed shoulders and even pressure; the effort should remain conversational.",
    mainRpe: 5,
    mainMinutes: [30, 45, 65, 40],
    name: "Elliptical Aerobic Endurance",
    purpose: "low-impact-endurance",
  },
  {
    description:
      "Inclined hiking builds hiking-specific leg endurance with deliberate downhill control.",
    ids: [
      "f2a00000-0005-4000-8001-000000000017",
      "f2a00000-0005-4000-8002-000000000018",
      "f2a00000-0005-4000-8003-000000000019",
      "f2a00000-0005-4000-8004-000000000020",
    ],
    intensity: "threshold",
    key: "incline-hike",
    mainName: "Incline Hiking",
    mainNotes:
      "Use a grade and pack load that allow controlled foot placement; descend slowly if included.",
    mainRpe: 7,
    mainMinutes: [25, 35, 50, 30],
    name: "Incline Hiking Strength",
    purpose: "hiking-endurance",
  },
];

function buildPlan(family: OtherFamily, levelIndex: number): SystemActivityPlanTemplate {
  const level = levels[levelIndex];
  const mainMinutes = family.mainMinutes[levelIndex];
  if (!level || !mainMinutes) throw new Error("Missing cross-training progression level");
  const builder = createSystemActivityPlanBuilder(
    "other",
    `expanded-other:${family.key}:${level.label}`,
  );
  builder.warmup({
    duration: Duration.minutes(6),
    targets: [Target.rpe(2)],
    notes: "Begin easily and check that movement feels comfortable today.",
  });
  builder.step({
    duration: Duration.minutes(mainMinutes),
    intervalName: "Main Set",
    name: family.mainName,
    notes: family.mainNotes,
    targets: [Target.rpe(family.mainRpe)],
  });
  builder.cooldown({
    duration: Duration.minutes(5),
    targets: [Target.rpe(2)],
    notes: "Ease gradually and finish with calm breathing.",
  });
  return {
    description: `${family.description} ${level.label} progression${level.triathlonContext ? " for triathlon race preparation, selected as low-impact supporting work alongside sport-specific sessions." : "."}`,
    gps_recording_enabled: family.key === "incline-hike",
    id: family.ids[levelIndex] as string,
    name: `${family.name} — ${level.label}`,
    structure: builder.build(),
  };
}

function durationClass(mainMinutes: number): ActivityPlanPortfolioMetadata["durationClass"] {
  return mainMinutes + 11 <= 60 ? "short" : mainMinutes + 11 <= 120 ? "medium" : "long";
}

export const EXPANDED_ENDURANCE_OTHER_ACTIVITIES = families.flatMap((family) =>
  levels.map((_, levelIndex) => buildPlan(family, levelIndex)),
);

export const EXPANDED_ENDURANCE_OTHER_METADATA: ActivityPlanPortfolioMetadata[] = families.flatMap(
  (family) =>
    levels.map((level, levelIndex) => ({
      difficulty: level.difficulty,
      durationClass: durationClass(family.mainMinutes[levelIndex] as number),
      family: `other:${family.key}`,
      primaryIntensity: family.intensity,
      primaryPurpose: family.purpose,
      templateId: family.ids[levelIndex] as string,
      triathlonContext: level.triathlonContext,
    })),
);
