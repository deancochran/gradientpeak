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
  repetitions?: readonly [number, number, number];
  steadyMinutes?: readonly [number, number, number, number];
};
const families: readonly RunFamily[] = [
  {
    id: "c1a00000-0001-4000-8001-000000000001",
    key: "easy-reset",
    name: "Easy Reset Run",
    description:
      "Conversational running that restores rhythm with deliberately low mechanical stress.",
    purpose: "recovery",
    primaryIntensity: "recovery",
    rpe: 3,
    workSeconds: 0,
    recoverySeconds: 0,
    steadyMinutes: [15, 20, 25, 30],
  },
  {
    id: "c1a00000-0002-4000-8001-000000000005",
    key: "aerobic-long-run",
    name: "Aerobic Long Run",
    description: "Steady aerobic running that builds durable, economical time on feet.",
    purpose: "aerobic-durability",
    primaryIntensity: "endurance",
    rpe: 5,
    workSeconds: 0,
    recoverySeconds: 0,
    steadyMinutes: [75, 80, 85, 90],
  },
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
      purpose: "work",
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
    const segment = requiredSampleItem(structure.segments, 0, "run activity segment");
    if (segment.role !== "activity") throw new Error("Expected run activity segment");
    const interval = requiredSampleItem(segment.intervals, 1, "run work interval");
    const step = requiredSampleItem(interval.steps, 0, "run work step");
    const adaptation = createSystemActivityPlanAdaptationBuilder(identity);
    return {
      id: family.id,
      name: family.name,
      description: family.description,
      gps_recording_enabled: true,
      structure,
      adaptation: {
        controls: [
          adaptation.control({
            key: "main_seconds",
            label: "Main-set duration",
            kind: "step_quantity",
            range: {
              minimum: family.steadyMinutes[0] * 60,
              default: minutes * 60,
              maximum: family.steadyMinutes[3] * 60,
              increment: 300,
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
        allowedStates: family.steadyMinutes.map((value) =>
          adaptation.state({ label: `${value} minutes`, values: { main_seconds: value * 60 } }),
        ),
      },
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
        purpose: "work",
        notes: `${family.description} Run tall and controlled; preserve the same mechanics through every repetition.`,
        targets: [Target.rpe(family.rpe)],
      },
      {
        duration: Duration.seconds(family.recoverySeconds),
        name: "Recovery",
        purpose: "recovery",
        notes: "Walk or jog easily until breathing and form are ready for the next effort.",
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
  const segment = requiredSampleItem(structure.segments, 0, "run activity segment");
  if (segment.role !== "activity") throw new Error("Expected run activity segment");
  const interval = requiredSampleItem(segment.intervals, 1, "run work interval");
  const adaptation = createSystemActivityPlanAdaptationBuilder(identity);
  return {
    id: family.id,
    name: family.name,
    description: family.description,
    gps_recording_enabled: true,
    structure,
    adaptation: {
      controls: [
        adaptation.control({
          key: "work_repetitions",
          label: "Work repetitions",
          kind: "interval_repetitions",
          range: {
            minimum: family.repetitions[0],
            default: family.repetitions[1],
            maximum: family.repetitions[2],
            increment: 1,
          },
          targets: [
            {
              type: "interval_repetitions",
              activitySegmentId: segment.id,
              intervalId: interval.id,
            },
          ],
        }),
      ],
    },
  };
}
export const EXPANDED_ENDURANCE_RUN_ACTIVITIES = families.map(buildRunPlan);
export const EXPANDED_ENDURANCE_RUN_METADATA: ActivityPlanPortfolioMetadata[] = families.map(
  (family) => ({
    difficulty: "development",
    durationClass:
      family.key === "aerobic-long-run" || family.key === "cruise-tempo" ? "medium" : "short",
    family: `run:${family.key}`,
    primaryIntensity: family.primaryIntensity,
    primaryPurpose: family.purpose,
    templateId: family.id,
    triathlonContext: false,
  }),
);
