import { Duration, Target } from "../schemas/activity_payload";
import {
  createSystemActivityPlanAdaptationBuilder,
  createSystemActivityPlanBuilder,
  requiredSampleItem,
} from "./activity-plan-builder";
import type {
  ActivityPlanIntensityBand,
  ActivityPlanPortfolioMetadata,
} from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

type StrengthFamily = {
  id: string;
  key: string;
  name: string;
  description: string;
  purpose: string;
  intensity: ActivityPlanIntensityBand;
  exercises: readonly [string, string];
  notes: readonly [string, string];
  reps: number;
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
    intensity: "endurance",
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
    intensity: "threshold",
    exercises: ["Front Squat", "Trap-Bar Deadlift"],
    notes: [
      "Leave one or two repetitions in reserve; do not grind the final rep.",
      "Reset between repetitions and maintain a neutral, braced trunk.",
    ],
    reps: 5,
    restSeconds: 135,
    workRpe: 7,
  },
  {
    id: "e2a00000-0003-4000-8001-000000000009",
    key: "single-leg-control",
    name: "Single-Leg Control",
    description: "Unilateral leg work and anti-rotation control develop stable single-leg force.",
    purpose: "single-leg-stability",
    intensity: "tempo",
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
    intensity: "vo2max",
    exercises: ["Kettlebell Swing", "Low Box Step-Up Drive"],
    notes: [
      "Use a light, familiar load and end the set before speed declines.",
      "Step down under control; replace the drive with a low step-up if landing is noisy.",
    ],
    reps: 6,
    restSeconds: 105,
    workRpe: 8,
  },
  {
    id: "e2a00000-0005-4000-8001-000000000017",
    key: "trunk-and-carry",
    name: "Trunk and Carry Strength",
    description:
      "Carries and trunk bracing develop posture and force transfer under controlled load.",
    purpose: "trunk-stability",
    intensity: "tempo",
    exercises: ["Farmer Carry", "Half-Kneeling Pallof Press"],
    notes: [
      "Walk tall with quiet steps; reduce load before grip or posture fails.",
      "Keep hips and ribs square rather than twisting toward the band.",
    ],
    reps: 10,
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
          duration: Duration.reps(family.reps),
          name: requiredSampleItem(family.exercises, index, "strength exercise"),
          purpose: "work",
          notes: requiredSampleItem(family.notes, index, "strength exercise note"),
          targets: [Target.rpe(family.workRpe)],
        },
        {
          duration: Duration.seconds(family.restSeconds),
          name: "Rest",
          purpose: "recovery",
          notes: "Recover fully enough to repeat precise movement.",
          targets: [Target.rpe(2)],
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
  const segment = requiredSampleItem(structure.segments, 0, "strength activity segment");
  if (segment.role !== "activity") throw new Error("Expected strength activity segment");
  const adaptation = createSystemActivityPlanAdaptationBuilder(identity);
  return {
    id: family.id,
    name: family.name,
    description: family.description,
    gps_recording_enabled: false,
    structure,
    adaptation: {
      controls: [
        adaptation.control({
          key: "set_count",
          label: "Set count",
          kind: "interval_repetitions",
          range: { minimum: 2, default: 3, maximum: 5, increment: 1 },
          targets: segment.intervals.slice(1, 3).map((interval) => ({
            type: "interval_repetitions",
            activitySegmentId: segment.id,
            intervalId: interval.id,
          })),
        }),
      ],
    },
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
