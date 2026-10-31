import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
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
];
function buildPlan(family: OtherFamily): SystemActivityPlanTemplate {
  const identity = `expanded-other:${family.key}`;
  const builder = createSystemActivityPlanBuilder("other", identity);
  builder.warmup({
    duration: Duration.minutes(6),
    targets: [Target.rpe(2)],
    notes: "Begin easily and check that movement feels comfortable today.",
  });
  if (family.key === "mobility-reset") {
    for (const [name = "", notes = ""] of [
      ["Hip circles", "8 circles each direction per side; move without forcing range."],
      ["Thoracic rotations", "8 rotations per side; keep the hips quiet."],
      ["Ankle rocks", "10 controlled rocks per side with the heel down."],
      ["Shoulder circles", "8 circles forward, then 8 backward."],
      ["Half-kneeling hip flexor reach", "5 slow reaches per side; keep the ribs stacked."],
      ["Cat-cow", "8 slow repetitions, matching each movement to an easy breath."],
    ]) {
      builder.step({
        duration: Duration.minutes(3),
        intervalName: "Mobility Flow",
        name,
        notes,
        targets: [Target.rpe(family.mainRpe)],
      });
    }
  } else if (family.key === "yoga-balance") {
    for (const [name = "", notes = ""] of [
      ["Mountain pose", "Hold for 5 calm breaths, then transition slowly."],
      ["Chair pose", "Hold for 5 calm breaths; keep weight even through both feet."],
      ["Warrior II", "Hold for 5 calm breaths on the left, then 5 on the right."],
      ["Triangle pose", "Hold for 5 calm breaths on the left, then 5 on the right."],
      [
        "Tree pose",
        "Hold for 5 calm breaths on the left, then 5 on the right; use a wall if needed.",
      ],
      ["Seated twist", "Hold for 5 calm breaths on the left, then 5 on the right."],
    ]) {
      builder.step({
        duration: Duration.minutes(5),
        intervalName: "Balance Flow",
        name,
        notes,
        targets: [Target.rpe(family.mainRpe)],
      });
    }
  } else {
    builder.step({
      duration: Duration.minutes(family.mainMinutes[1]),
      intervalName: "Main Set",
      name: family.mainName,
      notes: family.mainNotes,
      targets: [Target.rpe(family.mainRpe)],
    });
  }
  const structure = builder
    .cooldown({
      duration: Duration.minutes(5),
      targets: [Target.rpe(2)],
      notes: "Ease gradually and finish with calm breathing.",
    })
    .build();
  return {
    id: family.id,
    name: family.name,
    description: family.description,
    gps_recording_enabled: family.gps,
    structure,
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
