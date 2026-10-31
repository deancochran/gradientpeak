import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type {
  ActivityPlanIntensityBand,
  ActivityPlanPortfolioMetadata,
} from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

type RunFamily = {
  id: string;
  key: string;
  name: string;
  description: string;
  purpose: string;
  primaryIntensity: ActivityPlanIntensityBand;
  rpe: number;
  workSeconds: number;
  recoverySeconds: number;
  recoveryNotes: string;
  repetitions?: readonly [number, number, number];
  steadyMinutes?: readonly [number, number, number, number];
};
const families: readonly RunFamily[] = [
  {
    id: "c1a00000-0003-4000-8001-000000000009",
    key: "cruise-tempo",
    name: "Cruise Tempo Run",
    description:
      "Controlled tempo repetitions that develop sustainable speed below threshold strain.",
    purpose: "tempo",
    primaryIntensity: "tempo",
    rpe: 6,
    workSeconds: 510,
    recoverySeconds: 170,
    recoveryNotes:
      "Jog very easily throughout recovery; keep it conversational rather than turning it into another tempo effort.",
    repetitions: [3, 4, 6],
  },
  {
    id: "c1a00000-0006-4000-8001-000000000021",
    key: "anaerobic-hill",
    name: "Anaerobic Hill Surges",
    description:
      "Short hill surges that develop repeatable anaerobic power with full form-focused recovery.",
    purpose: "anaerobic-capacity",
    primaryIntensity: "anaerobic",
    rpe: 9,
    workSeconds: 45,
    recoverySeconds: 125,
    recoveryNotes:
      "Walk or jog gently downhill. Start the next surge only with controlled breathing and stable form; extend recovery if needed.",
    repetitions: [3, 4, 6],
  },
  {
    id: "c1a00000-0007-4000-8001-000000000025",
    key: "stride-speed",
    name: "Neuromuscular Strides",
    description:
      "Brief relaxed strides that sharpen coordination and leg speed without accumulating lactate.",
    purpose: "neuromuscular-speed",
    primaryIntensity: "neuromuscular",
    rpe: 9,
    workSeconds: 20,
    recoverySeconds: 90,
    recoveryNotes:
      "Walk or jog very easily until breathing settles. Keep each stride relaxed and quick; extend recovery rather than sprinting fatigued.",
    repetitions: [3, 4, 6],
  },
];
function buildRunPlan(family: RunFamily): SystemActivityPlanTemplate {
  const identity = `expanded-run:${family.key}`;
  const builder = createSystemActivityPlanBuilder("run", identity);
  builder.warmup({
    duration: Duration.minutes(12),
    targets: [Target.rpe(3)],
    notes: "Jog easily and include mobility drills before faster running.",
  });
  if (family.steadyMinutes) {
    const minutes = family.steadyMinutes[1];
    builder.step({
      duration: Duration.minutes(minutes),
      intervalName: "Main Set",
      name: family.name,
      notes: "Keep breathing controlled and stop early if gait changes.",
      targets: [Target.rpe(family.rpe)],
    });
    const structure = builder
      .cooldown({
        duration: Duration.minutes(10),
        targets: [Target.rpe(2)],
        notes: "Jog easily, then walk until breathing settles.",
      })
      .build();
    return {
      id: family.id,
      name: family.name,
      description: family.description,
      gps_recording_enabled: true,
      structure,
    };
  }
  if (family.repetitions === undefined) {
    throw new Error(`Run interval family ${family.key} is incomplete.`);
  }
  builder.interval({
    name: family.name,
    repeat: family.repetitions[1],
    steps: [
      {
        duration: Duration.seconds(family.workSeconds),
        name: "Work",
        notes: `${family.description} Run tall and controlled; preserve the same mechanics through every repetition.`,
        targets: [Target.rpe(family.rpe)],
      },
      {
        duration: Duration.seconds(family.recoverySeconds),
        name: "Recovery",
        notes: family.recoveryNotes,
        targets: [Target.rpe(2)],
      },
    ],
  });
  const structure = builder
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.rpe(2)],
      notes: "Jog easily, then walk until breathing settles.",
    })
    .build();
  return {
    id: family.id,
    name: family.name,
    description: family.description,
    gps_recording_enabled: true,
    structure,
  };
}
export const EXPANDED_ENDURANCE_RUN_ACTIVITIES = families.map(buildRunPlan);
export const EXPANDED_ENDURANCE_RUN_METADATA: ActivityPlanPortfolioMetadata[] = families.map(
  (family) => ({
    difficulty: "development",
    durationClass: family.key === "cruise-tempo" ? "medium" : "short",
    family: `run:${family.key}`,
    primaryIntensity: family.primaryIntensity,
    primaryPurpose: family.purpose,
    templateId: family.id,
    triathlonContext: false,
  }),
);
