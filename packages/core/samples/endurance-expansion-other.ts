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

type OtherFamily = {
  id: string;
  key: string;
  name: string;
  description: string;
  purpose: string;
  intensity: ActivityPlanIntensityBand;
  mainName: string;
  mainNotes: string;
  mainRpe: 3 | 4 | 5 | 6 | 7;
  mainMinutes: readonly [number, number, number, number];
  gps: boolean;
};
const families: readonly OtherFamily[] = [
  {
    id: "f2a00000-0001-4000-8001-000000000001",
    key: "mobility-reset",
    name: "Mobility Reset",
    description:
      "Gentle mobility and breathing reset restores comfortable movement after training.",
    purpose: "active-recovery",
    intensity: "recovery",
    mainName: "Mobility Flow",
    mainNotes: "Move through hips, thoracic spine, ankles, and shoulders without forcing range.",
    mainRpe: 3,
    mainMinutes: [12, 18, 24, 16],
    gps: false,
  },
  {
    id: "f2a00000-0002-4000-8001-000000000005",
    key: "yoga-balance",
    name: "Yoga Balance Flow",
    description:
      "A balance-focused yoga flow builds controlled positions, breathing, and relaxed mobility.",
    purpose: "mobility-and-balance",
    intensity: "endurance",
    mainName: "Balance Flow",
    mainNotes: "Use a wall or block as needed and keep the breath smooth in each position.",
    mainRpe: 4,
    mainMinutes: [20, 30, 40, 25],
    gps: false,
  },
  {
    id: "f2a00000-0003-4000-8001-000000000009",
    key: "row-technique",
    name: "Rowing Technique Tempo",
    description:
      "Rowing-erg technique intervals provide low-impact cross-training with repeatable rhythm.",
    purpose: "low-impact-tempo",
    intensity: "tempo",
    mainName: "Technique Row",
    mainNotes:
      "Sequence legs, body, then arms; reduce pace if stroke length or rhythm breaks down.",
    mainRpe: 6,
    mainMinutes: [16, 24, 32, 20],
    gps: false,
  },
  {
    id: "f2a00000-0004-4000-8001-000000000013",
    key: "elliptical-endurance",
    name: "Elliptical Aerobic Endurance",
    description: "Elliptical endurance develops aerobic volume without impact from running.",
    purpose: "low-impact-endurance",
    intensity: "endurance",
    mainName: "Steady Elliptical",
    mainNotes:
      "Maintain relaxed shoulders and even pressure; the effort should remain conversational.",
    mainRpe: 5,
    mainMinutes: [30, 45, 65, 40],
    gps: false,
  },
  {
    id: "f2a00000-0005-4000-8001-000000000017",
    key: "incline-hike",
    name: "Incline Hiking Strength",
    description:
      "Inclined hiking builds hiking-specific leg endurance with deliberate downhill control.",
    purpose: "hiking-endurance",
    intensity: "threshold",
    mainName: "Incline Hiking",
    mainNotes:
      "Use a grade and pack load that allow controlled foot placement; descend slowly if included.",
    mainRpe: 7,
    mainMinutes: [25, 35, 50, 30],
    gps: true,
  },
];
function buildPlan(family: OtherFamily): SystemActivityPlanTemplate {
  const identity = `expanded-other:${family.key}`;
  const builder = createSystemActivityPlanBuilder("other", identity);
  builder.warmup({
    duration: Duration.minutes(6),
    targets: [Target.rpe(2)],
    notes: "Begin easily and check that movement feels comfortable today.",
  });
  builder.step({
    duration: Duration.minutes(family.mainMinutes[1]),
    intervalName: "Main Set",
    name: family.mainName,
    purpose: "work",
    notes: family.mainNotes,
    targets: [Target.rpe(family.mainRpe)],
  });
  const structure = builder
    .cooldown({
      duration: Duration.minutes(5),
      targets: [Target.rpe(2)],
      notes: "Ease gradually and finish with calm breathing.",
    })
    .build();
  const segment = requiredSampleItem(structure.segments, 0, "other activity segment");
  if (segment.role !== "activity") throw new Error("Expected other activity segment");
  const interval = requiredSampleItem(segment.intervals, 1, "other work interval");
  const step = requiredSampleItem(interval.steps, 0, "other work step");
  const adaptation = createSystemActivityPlanAdaptationBuilder(identity);
  const allowedMinutes =
    family.key === "elliptical-endurance"
      ? family.mainMinutes.filter((value) => value >= 45)
      : family.mainMinutes;
  return {
    id: family.id,
    name: family.name,
    description: family.description,
    gps_recording_enabled: family.gps,
    structure,
    adaptation: {
      controls: [
        adaptation.control({
          key: "main_seconds",
          label: "Main-set duration",
          kind: "step_quantity",
          range: {
            minimum: family.mainMinutes[0] * 60,
            default: family.mainMinutes[1] * 60,
            maximum: family.mainMinutes[2] * 60,
            increment: 60,
          },
          targets: [
            {
              type: "step_quantity",
              activitySegmentId: segment.id,
              intervalId: interval.id,
              stepId: step.id,
              quantityType: "time",
            },
          ],
        }),
      ],
      allowedStates: allowedMinutes.map((value) =>
        adaptation.state({ label: `${value} minutes`, values: { main_seconds: value * 60 } }),
      ),
    },
  };
}
export const EXPANDED_ENDURANCE_OTHER_ACTIVITIES = families.map(buildPlan);
export const EXPANDED_ENDURANCE_OTHER_METADATA: ActivityPlanPortfolioMetadata[] = families.map(
  (family) => ({
    difficulty: "development",
    durationClass: family.mainMinutes[1] > 60 ? "medium" : "short",
    family: `other:${family.key}`,
    primaryIntensity: family.intensity,
    primaryPurpose: family.purpose,
    templateId: family.id,
    triathlonContext: false,
  }),
);
