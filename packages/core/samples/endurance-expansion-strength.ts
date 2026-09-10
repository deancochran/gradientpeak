import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type {
  ActivityPlanIntensityBand,
  ActivityPlanPortfolioMetadata,
} from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

const levels = [
  { difficulty: "foundation", label: "Foundation", sets: 2, triathlonContext: false },
  { difficulty: "development", label: "Build", sets: 3, triathlonContext: false },
  { difficulty: "advanced", label: "Advanced", sets: 4, triathlonContext: false },
  { difficulty: "race-specific", label: "Race Prep", sets: 5, triathlonContext: false },
] as const;

type StrengthFamily = {
  description: string;
  exercises: readonly [string, string];
  ids: readonly [string, string, string, string];
  intensity: ActivityPlanIntensityBand;
  key: string;
  name: string;
  notes: readonly [string, string];
  purpose: string;
  reps: readonly [number, number, number, number];
  restSeconds: number;
  workRpe: 5 | 6 | 7 | 8;
};

const families: readonly StrengthFamily[] = [
  {
    description: "Full-range squat and hinge practice builds durable foundational strength.",
    exercises: ["Goblet Squat", "Romanian Deadlift"],
    ids: [
      "e2a00000-0001-4000-8001-000000000001",
      "e2a00000-0001-4000-8002-000000000002",
      "e2a00000-0001-4000-8003-000000000003",
      "e2a00000-0001-4000-8004-000000000004",
    ],
    intensity: "endurance",
    key: "movement-capacity",
    name: "Movement Capacity Strength",
    notes: [
      "Use a load that permits a controlled descent and stable foot pressure.",
      "Keep ribs stacked and stop a set if range or balance changes.",
    ],
    purpose: "movement-capacity",
    reps: [10, 10, 12, 12],
    restSeconds: 60,
    workRpe: 5,
  },
  {
    description:
      "Lower-repetition compound lifting develops high-force strength with deliberate rest.",
    exercises: ["Front Squat", "Trap-Bar Deadlift"],
    ids: [
      "e2a00000-0002-4000-8001-000000000005",
      "e2a00000-0002-4000-8002-000000000006",
      "e2a00000-0002-4000-8003-000000000007",
      "e2a00000-0002-4000-8004-000000000008",
    ],
    intensity: "threshold",
    key: "compound-strength",
    name: "Compound Strength",
    notes: [
      "Leave one or two repetitions in reserve; do not grind the final rep.",
      "Reset between repetitions and maintain a neutral, braced trunk.",
    ],
    purpose: "max-strength",
    reps: [6, 5, 5, 4],
    restSeconds: 150,
    workRpe: 7,
  },
  {
    description: "Unilateral leg work and anti-rotation control develop stable single-leg force.",
    exercises: ["Rear-Foot Elevated Split Squat", "Single-Leg Romanian Deadlift"],
    ids: [
      "e2a00000-0003-4000-8001-000000000009",
      "e2a00000-0003-4000-8002-000000000010",
      "e2a00000-0003-4000-8003-000000000011",
      "e2a00000-0003-4000-8004-000000000012",
    ],
    intensity: "tempo",
    key: "single-leg-control",
    name: "Single-Leg Control",
    notes: [
      "Use support if needed; keep the working knee tracking over the middle toes.",
      "Move slowly enough to keep the pelvis level on every repetition.",
    ],
    purpose: "single-leg-stability",
    reps: [8, 8, 10, 10],
    restSeconds: 90,
    workRpe: 6,
  },
  {
    description:
      "Low-repetition explosive movements develop force production while protecting landing quality.",
    exercises: ["Kettlebell Swing", "Low Box Step-Up Drive"],
    ids: [
      "e2a00000-0004-4000-8001-000000000013",
      "e2a00000-0004-4000-8002-000000000014",
      "e2a00000-0004-4000-8003-000000000015",
      "e2a00000-0004-4000-8004-000000000016",
    ],
    intensity: "vo2max",
    key: "power-production",
    name: "Power Production",
    notes: [
      "Use a light, familiar load and end the set before speed declines.",
      "Step down under control; replace the drive with a low step-up if landing is noisy.",
    ],
    purpose: "power-development",
    reps: [5, 6, 6, 6],
    restSeconds: 120,
    workRpe: 8,
  },
  {
    description:
      "Carries and trunk bracing develop posture and force transfer under controlled load.",
    exercises: ["Farmer Carry", "Half-Kneeling Pallof Press"],
    ids: [
      "e2a00000-0005-4000-8001-000000000017",
      "e2a00000-0005-4000-8002-000000000018",
      "e2a00000-0005-4000-8003-000000000019",
      "e2a00000-0005-4000-8004-000000000020",
    ],
    intensity: "tempo",
    key: "trunk-and-carry",
    name: "Trunk and Carry Strength",
    notes: [
      "Walk tall with quiet steps; reduce load before grip or posture fails.",
      "Keep hips and ribs square rather than twisting toward the band.",
    ],
    purpose: "trunk-stability",
    reps: [8, 10, 12, 12],
    restSeconds: 75,
    workRpe: 6,
  },
];

function buildPlan(family: StrengthFamily, levelIndex: number): SystemActivityPlanTemplate {
  const level = levels[levelIndex];
  const reps = family.reps[levelIndex];
  if (!level || !reps) throw new Error("Missing strength progression level");
  const builder = createSystemActivityPlanBuilder(
    "strength",
    `expanded-strength:${family.key}:${level.label}`,
  );
  builder.warmup({
    duration: Duration.minutes(6 + levelIndex),
    targets: [Target.rpe(3)],
    notes: "Use joint circles, bodyweight rehearsal, and one lighter practice set before loading.",
  });
  for (let exerciseIndex = 0; exerciseIndex < family.exercises.length; exerciseIndex += 1) {
    const exercise = family.exercises[exerciseIndex];
    const note = family.notes[exerciseIndex];
    if (!exercise || !note) throw new Error("Incomplete strength-family prescription");
    builder.interval({
      name: exercise,
      repeat: level.sets,
      steps: [
        {
          duration: Duration.reps(reps),
          name: exercise,
          notes: note,
          targets: [Target.rpe(family.workRpe)],
        },
        {
          duration: Duration.seconds(Math.max(45, family.restSeconds - levelIndex * 15)),
          name: "Rest",
          notes: "Recover fully enough to repeat precise movement.",
          targets: [Target.rpe(2)],
        },
      ],
    });
  }
  builder.cooldown({
    duration: Duration.minutes(5),
    targets: [Target.rpe(2)],
    notes: "Walk briefly, then use comfortable range-of-motion work for the trained areas.",
  });
  return {
    description: `${family.description} ${level.label} progression${level.triathlonContext ? " for triathlon race preparation, using familiar loads rather than introducing new exercises." : "."}`,
    gps_recording_enabled: false,
    id: family.ids[levelIndex] as string,
    name: `${family.name} — ${level.label}`,
    structure: builder.build(),
  };
}

export const EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES = families.flatMap((family) =>
  levels.map((_, levelIndex) => buildPlan(family, levelIndex)),
);

export const EXPANDED_ENDURANCE_STRENGTH_METADATA: ActivityPlanPortfolioMetadata[] =
  families.flatMap((family) =>
    levels.map((level, levelIndex) => ({
      difficulty: level.difficulty,
      durationClass: "short",
      family: `strength:${family.key}`,
      primaryIntensity: family.intensity,
      primaryPurpose: family.purpose,
      templateId: family.ids[levelIndex] as string,
      triathlonContext: level.triathlonContext,
    })),
  );
