import { createSystemActivityPlanBuilder } from "./activity-plan-builder";
import type { SystemActivityPlanTemplate } from "./types";

export const REFERENCE_ASSESSMENT_TEMPLATE_IDS = Object.freeze([
  "b5a10000-0001-4000-8001-000000000001",
  "b5a10000-0001-4000-8001-000000000002",
  "b5a10000-0001-4000-8001-000000000003",
] as const);

export type ReferenceAssessmentId = (typeof REFERENCE_ASSESSMENT_TEMPLATE_IDS)[number];

export type ReferenceAssessmentMetadata = {
  sourceUrl: string;
  templateId: ReferenceAssessmentId;
};

/** Editorial metadata only: no assessment state is persisted or calculated by the app. */
export const REFERENCE_ASSESSMENT_METADATA_BY_ID: Readonly<
  Record<ReferenceAssessmentId, ReferenceAssessmentMetadata>
> = Object.freeze({
  "b5a10000-0001-4000-8001-000000000001": Object.freeze({
    templateId: "b5a10000-0001-4000-8001-000000000001",
    sourceUrl:
      "https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/",
  }),
  "b5a10000-0001-4000-8001-000000000002": Object.freeze({
    templateId: "b5a10000-0001-4000-8001-000000000002",
    sourceUrl:
      "https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/",
  }),
  "b5a10000-0001-4000-8001-000000000003": Object.freeze({
    templateId: "b5a10000-0001-4000-8001-000000000003",
    sourceUrl: "https://www.myprocoach.net/calculators/critical-swim-speed/",
  }),
});

export const REFERENCE_ASSESSMENT_METADATA = Object.freeze(
  REFERENCE_ASSESSMENT_TEMPLATE_IDS.map((id) => REFERENCE_ASSESSMENT_METADATA_BY_ID[id]),
);

export function isReferenceAssessmentTemplateId(id: string): id is ReferenceAssessmentId {
  return (REFERENCE_ASSESSMENT_TEMPLATE_IDS as readonly string[]).includes(id);
}

export function getReferenceAssessmentMetadata(
  id: string,
): ReferenceAssessmentMetadata | undefined {
  return isReferenceAssessmentTemplateId(id) ? REFERENCE_ASSESSMENT_METADATA_BY_ID[id] : undefined;
}

const assessmentSafety = "Hard test for prepared, healthy athletes; stop if unwell.";

export const REFERENCE_ASSESSMENT_ACTIVITIES: readonly SystemActivityPlanTemplate[] = [
  {
    id: REFERENCE_ASSESSMENT_TEMPLATE_IDS[0],
    name: "Cycling FTP Assessment",
    gps_recording_enabled: false,
    training_intent: "threshold_development",
    description: `${assessmentSafety}\nDuring test: record average power for 30 min. At exactly 30:00, lap and record this test interval only, including zeros; do not use normalized power or include warm-up/cool-down.\nResult: use that wattage as your FTP estimate (240 W → 240 W).`,
    structure: createSystemActivityPlanBuilder("bike", "assessment-bike-ftp-30m")
      .warmup({
        name: "Easy warm-up",
        duration: { type: "time", seconds: 900 },
        targets: [{ type: "RPE", intensity: 3 }],
        notes: "Ride easy at RPE 2–3.",
      })
      .interval({
        repeat: 3,
        name: "Cadence preparation",
        steps: [
          {
            name: "High cadence",
            duration: { type: "time", seconds: 60 },
            targets: [{ type: "RPE", intensity: 5 }],
            notes: "Controlled high cadence.",
          },
          {
            name: "Easy spin",
            duration: { type: "time", seconds: 60 },
            targets: [{ type: "RPE", intensity: 2 }],
          },
        ],
      })
      .step({
        name: "Easy settle",
        duration: { type: "time", seconds: 300 },
        targets: [{ type: "RPE", intensity: 2 }],
      })
      .step({
        name: "FTP test",
        duration: { type: "time", seconds: 1800 },
        targets: [{ type: "RPE", intensity: 9 }],
        notes:
          "Start controlled—do not sprint. Ride the hardest even effort you can sustain. At exactly 30:00, lap and record average power for this test interval only, including zeros; do not use normalized power or include warm-up/cool-down.",
      })
      .cooldown({
        duration: { type: "time", seconds: 600 },
        targets: [{ type: "RPE", intensity: 2 }],
      })
      .build(),
  },
  {
    id: REFERENCE_ASSESSMENT_TEMPLATE_IDS[1],
    name: "Running Threshold Pace Assessment",
    gps_recording_enabled: true,
    training_intent: "threshold_development",
    description: `${assessmentSafety}\nPace: 30 min ÷ distance in km (6 km → 5:00/km).\nOptional threshold HR: average of final 20 min.`,
    structure: createSystemActivityPlanBuilder("run", "assessment-run-threshold-30m")
      .warmup({
        name: "Easy warm-up",
        duration: { type: "time", seconds: 900 },
        targets: [{ type: "RPE", intensity: 3 }],
      })
      .interval({
        repeat: 3,
        name: "Stride preparation",
        steps: [
          {
            name: "Controlled stride",
            duration: { type: "time", seconds: 20 },
            targets: [{ type: "RPE", intensity: 7 }],
            notes: "Smooth, controlled—not a sprint.",
          },
          {
            name: "Easy jog",
            duration: { type: "time", seconds: 60 },
            targets: [{ type: "RPE", intensity: 2 }],
          },
        ],
      })
      .step({
        name: "Easy settle",
        duration: { type: "time", seconds: 180 },
        targets: [{ type: "RPE", intensity: 2 }],
      })
      .step({
        name: "Threshold test",
        duration: { type: "time", seconds: 600 },
        targets: [{ type: "RPE", intensity: 8 }],
        notes: "Begin controlled and settle into a hard, even race effort; no sprint start.",
      })
      .step({
        name: "Threshold test",
        duration: { type: "time", seconds: 1200 },
        targets: [{ type: "RPE", intensity: 9 }],
        notes:
          "Continue without rest. At 30:00, lap and record whole-test distance; separately capture average heart rate for this final 20-minute interval.",
      })
      .cooldown({
        duration: { type: "time", seconds: 600 },
        targets: [{ type: "RPE", intensity: 2 }],
      })
      .build(),
  },
  {
    id: REFERENCE_ASSESSMENT_TEMPLATE_IDS[2],
    name: "Swimming CSS Assessment — 400 m / 200 m",
    gps_recording_enabled: false,
    training_intent: "threshold_development",
    description: `${assessmentSafety}\nRecord 400 m and 200 m times in seconds.\nCSS = (400 m time − 200 m time) ÷ 2, seconds/100 m.\n7:00 and 3:20 → 1:50/100 m.`,
    structure: createSystemActivityPlanBuilder("swim", "assessment-swim-css-400-200")
      .warmup({
        name: "Easy warm-up",
        duration: { type: "distance", meters: 400 },
        targets: [{ type: "RPE", intensity: 3 }],
        notes: "Swim easy freestyle and finish with a long, relaxed stroke.",
      })
      .interval({
        repeat: 4,
        name: "Build preparation",
        steps: [
          {
            name: "Build swim",
            duration: { type: "distance", meters: 50 },
            targets: [{ type: "RPE", intensity: 6 }],
            notes: "Swim freestyle from easy to strong while preserving stroke length.",
          },
          {
            name: "Timed rest",
            duration: { type: "time", seconds: 20 },
            targets: [{ type: "rest" }],
            notes: "Rest at the wall for 20 seconds before the next build swim.",
          },
        ],
      })
      .step({
        name: "Easy preparation",
        duration: { type: "distance", meters: 200 },
        targets: [{ type: "RPE", intensity: 2 }],
        notes: "Swim easy freestyle with calm breathing before the time trial.",
      })
      .step({
        name: "Time trial",
        duration: { type: "distance", meters: 400 },
        targets: [{ type: "RPE", intensity: 9 }],
        notes: "Steady hard push; record the complete 400 m time.",
      })
      .step({
        name: "Active recovery",
        duration: { type: "time", seconds: 300 },
        targets: [{ type: "RPE", intensity: 2 }],
        notes:
          "Very easy swimming. Be fully recovered before the 200 m; if you need longer, extend recovery manually and record the actual timed test intervals.",
      })
      .step({
        name: "Time trial",
        duration: { type: "distance", meters: 200 },
        targets: [{ type: "RPE", intensity: 9 }],
        notes: "Steady hard push; record the complete 200 m time.",
      })
      .cooldown({
        duration: { type: "distance", meters: 200 },
        targets: [{ type: "RPE", intensity: 2 }],
        notes: "Swim down easy freestyle or backstroke.",
      })
      .build(),
  },
];
