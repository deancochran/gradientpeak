import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type {
  ActivityPlanIntensityBand,
  ActivityPlanPortfolioMetadata,
} from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

type SwimFamily = {
  id: string;
  key: string;
  name: string;
  description: string;
  purpose: string;
  primaryIntensity: ActivityPlanIntensityBand;
  rpe: number;
  workMeters: number;
  recoverySeconds: number;
};
const families: readonly SwimFamily[] = [
  {
    id: "d1a00000-0001-4000-8001-000000000001",
    key: "recovery-feel",
    name: "Recovery Feel Swim",
    description: "Easy swimming that restores feel for the water and relaxed alignment.",
    purpose: "recovery",
    primaryIntensity: "recovery",
    rpe: 3,
    workMeters: 200,
    recoverySeconds: 15,
  },
  {
    id: "d1a00000-0002-4000-8001-000000000005",
    key: "aerobic-continuity",
    name: "Aerobic Continuity Swim",
    description: "Continuous aerobic repeats that develop economical, repeatable freestyle.",
    purpose: "aerobic-durability",
    primaryIntensity: "endurance",
    rpe: 5,
    workMeters: 400,
    recoverySeconds: 25,
  },
  {
    id: "d1a00000-0003-4000-8001-000000000009",
    key: "tempo-pull",
    name: "Tempo Pull Set",
    description:
      "Controlled pull buoy tempo repeats that reinforce a firm catch and steady pressure.",
    purpose: "tempo",
    primaryIntensity: "tempo",
    rpe: 6,
    workMeters: 200,
    recoverySeconds: 20,
  },
  {
    id: "d1a00000-0004-4000-8001-000000000013",
    key: "css-threshold",
    name: "CSS Threshold Swim",
    description: "Critical swim speed repeats that improve sustainable race-pace control.",
    purpose: "threshold",
    primaryIntensity: "threshold",
    rpe: 7,
    workMeters: 150,
    recoverySeconds: 20,
  },
  {
    id: "d1a00000-0005-4000-8001-000000000017",
    key: "vo2-pace",
    name: "VO2 Pace Swim",
    description: "Hard 100-metre repeats that raise aerobic power while preserving stroke length.",
    purpose: "vo2max",
    primaryIntensity: "vo2max",
    rpe: 8,
    workMeters: 100,
    recoverySeconds: 30,
  },
  {
    id: "d1a00000-0006-4000-8001-000000000021",
    key: "anaerobic-50s",
    name: "Anaerobic 50s",
    description:
      "Short 50-metre efforts that develop repeatable speed with enough rest to protect technique.",
    purpose: "anaerobic-capacity",
    primaryIntensity: "anaerobic",
    rpe: 9,
    workMeters: 50,
    recoverySeconds: 70,
  },
  {
    id: "d1a00000-0007-4000-8001-000000000025",
    key: "neuromuscular-25s",
    name: "Neuromuscular 25s",
    description:
      "Brief 25-metre accelerations that sharpen stroke timing with complete quality recovery.",
    purpose: "neuromuscular-speed",
    primaryIntensity: "neuromuscular",
    rpe: 9,
    workMeters: 25,
    recoverySeconds: 85,
  },
  {
    id: "d1a00000-0008-4000-8001-000000000029",
    key: "sighting-endurance",
    name: "Sighting Endurance Swim",
    description:
      "Aerobic freestyle repeats that rehearse lifting the eyes forward every six to eight strokes without breaking body line.",
    purpose: "open-water-sighting-endurance",
    primaryIntensity: "endurance",
    rpe: 5,
    workMeters: 300,
    recoverySeconds: 20,
  },
  {
    id: "d1a00000-0009-4000-8001-000000000033",
    key: "tempo-negative-split",
    name: "Tempo Negative-Split Swim",
    description:
      "Tempo repeats that finish faster than they begin, teaching controlled pressure and a patient first half.",
    purpose: "tempo-pacing-control",
    primaryIntensity: "tempo",
    rpe: 6,
    workMeters: 250,
    recoverySeconds: 25,
  },
];
function buildPlan(family: SwimFamily): SystemActivityPlanTemplate {
  const identity = `expanded-swim:${family.key}`;
  const builder = createSystemActivityPlanBuilder("swim", identity);
  builder.warmup({
    duration: Duration.meters(350),
    targets: [Target.rpe(3)],
    notes:
      "Swim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.",
  });
  builder.interval({
    name: family.name,
    repeat: 4,
    steps: [
      {
        duration: Duration.meters(family.workMeters),
        name: "Work",
        notes: `${family.description} Hold the prescribed effort only while stroke length and breathing remain controlled.`,
        targets: [Target.rpe(family.rpe)],
      },
      {
        duration: Duration.seconds(family.recoverySeconds),
        name: "Recovery",
        notes: "Rest at the wall; start the next repeat with calm breathing and deliberate form.",
        targets: [{ type: "rest" }],
      },
    ],
  });
  const structure = builder
    .cooldown({
      duration: Duration.meters(250),
      targets: [Target.rpe(2)],
      notes: "Swim down easily and finish before technique degrades.",
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
export const EXPANDED_ENDURANCE_SWIM_ACTIVITIES = families.map(buildPlan);
export const EXPANDED_ENDURANCE_SWIM_METADATA: ActivityPlanPortfolioMetadata[] = families.map(
  (family) => ({
    difficulty: "development",
    durationClass: ["aerobic-continuity", "sighting-endurance", "tempo-negative-split"].includes(
      family.key,
    )
      ? "medium"
      : "short",
    family: `swim:${family.key}`,
    primaryIntensity: family.primaryIntensity,
    primaryPurpose: family.purpose,
    templateId: family.id,
    triathlonContext: false,
  }),
);
