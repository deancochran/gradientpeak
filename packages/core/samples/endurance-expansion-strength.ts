import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder, requiredSampleItem } from "./activity-plan-builder";
import type {
  ActivityPlanPortfolioMetadata,
  ActivityPlanStrengthEffortBand,
} from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

type StrengthFamily = {
  id: string;
  key: string;
  name: string;
  description: string;
  purpose: string;
  intensity: ActivityPlanStrengthEffortBand;
  exercises: readonly [string, string];
  notes: readonly [string, string];
  reps: number;
  firstExerciseSeconds?: number;
  restSeconds: number;
  workRpe: 5 | 6 | 7 | 8;
};
const families: readonly StrengthFamily[] = [
  {
    id: "e2a00000-0001-4000-8001-000000000001",
    key: "movement-capacity",
    name: "Movement Capacity Strength",
    description: "Full-range squat and hinge practice builds durable foundational strength.",
    purpose: "movement-capacity",
    intensity: "strength-light",
    exercises: ["Goblet Squat", "Romanian Deadlift"],
    notes: [
      "Use a load that permits a controlled descent and stable foot pressure.",
      "Keep ribs stacked and stop a set if range or balance changes.",
    ],
    reps: 10,
    restSeconds: 45,
    workRpe: 5,
  },
  {
    id: "e2a00000-0002-4000-8001-000000000005",
    key: "compound-strength",
    name: "Compound Strength",
    description:
      "Lower-repetition compound lifting develops high-force strength with deliberate rest.",
    purpose: "max-strength",
    intensity: "strength-hard",
    exercises: ["Front Squat", "Trap-Bar Deadlift"],
    notes: [
      "Choose a load that leaves about two clean reps in reserve; do not grind the final rep.",
      "Leave about two clean reps in reserve; reset your brace between repetitions.",
    ],
    reps: 5,
    restSeconds: 180,
    workRpe: 8,
  },
  {
    id: "e2a00000-0003-4000-8001-000000000009",
    key: "single-leg-control",
    name: "Single-Leg Control",
    description: "Unilateral leg work and anti-rotation control develop stable single-leg force.",
    purpose: "single-leg-stability",
    intensity: "strength-moderate",
    exercises: ["Rear-Foot Elevated Split Squat", "Single-Leg Romanian Deadlift"],
    notes: [
      "Use support if needed; keep the working knee tracking over the middle toes.",
      "Move slowly enough to keep the pelvis level on every repetition.",
    ],
    reps: 8,
    restSeconds: 75,
    workRpe: 6,
  },
  {
    id: "e2a00000-0004-4000-8001-000000000013",
    key: "power-production",
    name: "Power Production",
    description:
      "Low-repetition explosive movements develop force production while protecting landing quality.",
    purpose: "power-development",
    intensity: "strength-moderate",
    exercises: ["Kettlebell Swing", "Low Box Step-Up Drive"],
    notes: [
      "Use a light, familiar load and end the set before speed declines.",
      "Step down under control; replace the drive with a low step-up if landing is noisy.",
    ],
    reps: 6,
    restSeconds: 180,
    workRpe: 6,
  },
  {
    id: "e2a00000-0005-4000-8001-000000000017",
    key: "trunk-and-carry",
    name: "Trunk and Carry Strength",
    description:
      "Carries and trunk bracing develop posture and force transfer under controlled load.",
    purpose: "trunk-stability",
    intensity: "strength-moderate",
    exercises: ["Farmer Carry", "Half-Kneeling Pallof Press"],
    notes: [
      "Carry continuously for the prescribed time; walk tall with quiet steps and reduce load before grip or posture fails.",
      "Keep hips and ribs square rather than twisting toward the band.",
    ],
    reps: 10,
    firstExerciseSeconds: 30,
    restSeconds: 60,
    workRpe: 6,
  },
];
function buildPlan(family: StrengthFamily): SystemActivityPlanTemplate {
  const identity = `expanded-strength:${family.key}`;
  const builder = createSystemActivityPlanBuilder("strength", identity);
  builder.warmup({
    duration: Duration.minutes(7),
    targets: [Target.rpe(3)],
    notes: "Use joint circles, bodyweight rehearsal, and one lighter practice set before loading.",
  });
  for (let index = 0; index < family.exercises.length; index += 1)
    builder.interval({
      name: requiredSampleItem(family.exercises, index, "strength exercise"),
      repeat: 3,
      steps: [
        {
          duration:
            index === 0 && family.firstExerciseSeconds !== undefined
              ? Duration.seconds(family.firstExerciseSeconds)
              : Duration.reps(family.reps),
          name: requiredSampleItem(family.exercises, index, "strength exercise"),
          notes: requiredSampleItem(family.notes, index, "strength exercise note"),
          targets: [Target.rpe(family.workRpe)],
        },
        {
          duration: Duration.seconds(family.restSeconds),
          name: "Rest",
          notes: "Recover fully enough to repeat precise movement.",
          targets: [{ type: "rest" }],
        },
      ],
    });
  const structure = builder
    .cooldown({
      duration: Duration.minutes(5),
      targets: [Target.rpe(2)],
      notes: "Walk briefly, then use comfortable range-of-motion work for the trained areas.",
    })
    .build();
  return {
    id: family.id,
    name: family.name,
    description: family.description,
    gps_recording_enabled: false,
    structure,
  };
}
export const EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES = families.map(buildPlan);
export const EXPANDED_ENDURANCE_STRENGTH_METADATA: ActivityPlanPortfolioMetadata[] = families.map(
  (family) => ({
    difficulty: "development",
    durationClass: "short",
    family: `strength:${family.key}`,
    primaryIntensity: family.intensity,
    primaryPurpose: family.purpose,
    templateId: family.id,
    triathlonContext: false,
  }),
);
