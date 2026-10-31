import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type {
  ActivityPlanIntensityBand,
  ActivityPlanPortfolioMetadata,
} from "./activity-plan-portfolio";
import type { SystemActivityPlanTemplate } from "./types";

type BikeFamily = {
  id: string;
  key: string;
  name: string;
  description: string;
  purpose: string;
  primaryIntensity: ActivityPlanIntensityBand;
  workFtp: number;
  workCadence?: number;
  workNote: string;
  repetitions?: readonly [number, number, number];
  recoverySeconds?: number;
  workSeconds?: number;
  steadyMinutes?: readonly [number, number, number, number];
};

const families: readonly BikeFamily[] = [
  {
    id: "b1c00000-0003-4000-8001-000000000009",
    key: "tempo-control",
    name: "Tempo Control Intervals",
    description:
      "Controlled tempo intervals that improve sustained power without threshold-level fatigue.",
    purpose: "tempo",
    primaryIntensity: "tempo",
    workFtp: 80,
    workNote:
      "Settle quickly, keep cadence stable, and avoid power spikes at the start of each interval.",
    repetitions: [3, 4, 6],
    recoverySeconds: 240,
    workSeconds: 600,
  },
  {
    id: "b1c00000-0004-4000-8001-000000000013",
    key: "threshold-power",
    name: "Threshold Power Intervals",
    description:
      "Threshold intervals that build sustainable race power and tolerance for prolonged pressure.",
    purpose: "threshold",
    primaryIntensity: "threshold",
    workFtp: 90,
    workNote:
      "Ride close to threshold with controlled breathing and repeatable power through the final interval.",
    repetitions: [3, 4, 6],
    recoverySeconds: 240,
    workSeconds: 480,
  },
  {
    id: "b1c00000-0006-4000-8001-000000000021",
    key: "anaerobic-repeatability",
    name: "Anaerobic Repeatability",
    description:
      "Short anaerobic efforts that develop repeatable surges for climbs, attacks, and race changes.",
    purpose: "anaerobic-capacity",
    primaryIntensity: "anaerobic",
    workFtp: 110,
    workNote:
      "Accelerate decisively, then hold form and torque without fading through the final seconds.",
    repetitions: [3, 4, 6],
    recoverySeconds: 180,
    workSeconds: 90,
  },
  {
    id: "b1c00000-0007-4000-8001-000000000025",
    key: "neuromuscular-sprints",
    name: "Neuromuscular Sprint Set",
    description:
      "Neuromuscular sprint repetitions that develop peak cycling power with complete recovery.",
    purpose: "sprint-power",
    primaryIntensity: "neuromuscular",
    workFtp: 125,
    workNote:
      "Sprint with excellent posture and fast force production; stop if power or technique deteriorates.",
    repetitions: [3, 4, 6],
    recoverySeconds: 225,
    workSeconds: 15,
  },
  {
    id: "b1c00000-0008-4000-8001-000000000029",
    key: "cadence-endurance",
    name: "Cadence Endurance Blocks",
    description:
      "Endurance blocks with deliberate cadence changes that build aerobic efficiency without relying on one steady gear.",
    purpose: "aerobic-cadence-efficiency",
    primaryIntensity: "endurance",
    workFtp: 70,
    workCadence: 90,
    workNote: "Hold a smooth, even pedal stroke while maintaining aerobic pressure.",
    repetitions: [3, 4, 6],
    recoverySeconds: 180,
    workSeconds: 480,
  },
];

function buildBikePlan(family: BikeFamily): SystemActivityPlanTemplate {
  const identity = `expanded-bike:${family.key}`;
  const builder = createSystemActivityPlanBuilder("bike", identity);
  builder.warmup({
    duration: Duration.minutes(11),
    targets: [Target.ftp(55)],
    notes: "Build cadence gradually and confirm that the intended target is appropriate today.",
  });
  if (family.steadyMinutes) {
    const mainMinutes = family.steadyMinutes[1];
    builder.step({
      duration: Duration.minutes(mainMinutes),
      intervalName: "Main Set",
      name: family.name,
      notes: family.workNote,
      targets: [Target.ftp(family.workFtp)],
    });
    const structure = builder
      .cooldown({
        duration: Duration.minutes(9),
        targets: [Target.ftp(50)],
        notes: "Reduce pressure progressively and finish with relaxed, smooth pedaling.",
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
  if (
    family.repetitions === undefined ||
    family.workSeconds === undefined ||
    family.recoverySeconds === undefined
  ) {
    throw new Error(`Bike interval family ${family.key} is incomplete.`);
  }
  const repetitions = family.repetitions[1];
  builder.interval({
    name: family.name,
    repeat: repetitions,
    steps: [
      {
        duration: Duration.seconds(family.workSeconds),
        name: "Work",
        notes: family.workNote,
        targets: [
          Target.ftp(family.workFtp),
          ...(family.workCadence === undefined ? [] : [Target.cadence(family.workCadence)]),
        ],
      },
      {
        duration: Duration.seconds(family.recoverySeconds),
        name: "Recovery",
        notes: "Pedal easily until breathing and movement quality are ready for the next effort.",
        targets: [Target.ftp(50)],
      },
    ],
  });
  const structure = builder
    .cooldown({
      duration: Duration.minutes(9),
      targets: [Target.ftp(50)],
      notes: "Reduce pressure progressively and finish with relaxed, smooth pedaling.",
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

export const EXPANDED_ENDURANCE_BIKE_ACTIVITIES = families.map(buildBikePlan);
export const EXPANDED_ENDURANCE_BIKE_METADATA: ActivityPlanPortfolioMetadata[] = families.map(
  (family) => ({
    difficulty: "development",
    durationClass:
      family.steadyMinutes?.[1] && family.steadyMinutes[1] > 60
        ? "medium"
        : ["tempo-control", "threshold-power", "cadence-endurance"].includes(family.key)
          ? "medium"
          : "short",
    family: `bike:${family.key}`,
    primaryIntensity: family.primaryIntensity,
    primaryPurpose: family.purpose,
    templateId: family.id,
    triathlonContext: false,
  }),
);
