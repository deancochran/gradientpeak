import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { activityPlanStructureSchema } from "../../activity-plan";
import {
  ALL_SAMPLE_PLANS,
  FIXED_SYSTEM_ACTIVITY_TEMPLATE_COUNT,
  getReferenceAssessmentMetadata,
  getSystemActivityTemplateDefinitions,
  getSystemTrainingPlanDefinitions,
  OTHER_THRESHOLD_ROW,
  REFERENCE_ASSESSMENT_METADATA_BY_ID,
  REFERENCE_ASSESSMENT_TEMPLATE_IDS,
  RETIRED_SYSTEM_ACTIVITY_TEMPLATE_IDS,
  RETIRED_SYSTEM_TRAINING_PLAN_IDS,
  SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES,
  SYSTEM_TEMPLATES,
  SYSTEM_TRACK_RUN_WORKOUTS,
  type SystemTemplate,
} from "../../samples";
import { createSystemActivityPlanBuilder } from "../../samples/activity-plan-builder";
import { persistedTrainingPlanStructureSchema, trainingPlanSchema } from "../../schemas";
import { materializePlanToEvents } from "../materializePlanToEvents";
import {
  buildSystemActivityTemplateCatalog,
  normalizeActivityTemplateStructureForAudit,
} from "../verification/activityTemplateCatalog";
import {
  assertSystemTrainingPlanTemplateLinksResolved,
  buildSystemTemplateIndex,
} from "../verification/systemPlanAudit";

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

const structureIds = (structure: SystemTemplate["structure"]) =>
  structure.items.flatMap((item) =>
    item.type === "repeat" ? [item.id, ...item.steps.map((step) => step.id)] : [item.id],
  );
const structureSteps = (structure: SystemTemplate["structure"]) =>
  structure.items.flatMap((item) => (item.type === "repeat" ? item.steps : [item]));

describe("fixed V5 system activity-template catalog", () => {
  it("exposes deterministic content definitions for the 68 active fixed templates", async () => {
    const first = await getSystemActivityTemplateDefinitions();
    const second = await getSystemActivityTemplateDefinitions();
    const training = await getSystemTrainingPlanDefinitions();
    expect(first).toEqual(second);
    expect(SYSTEM_TEMPLATES).toHaveLength(68);
    expect(FIXED_SYSTEM_ACTIVITY_TEMPLATE_COUNT).toBe(68);
    expect(first).toHaveLength(68);
    expect(training).toEqual([]);
    expect(
      first.every((definition) => /^v1:sha256:[0-9a-f]{64}$/.test(definition.contentHash)),
    ).toBe(true);
  });

  it("validates every fixed template and preserves unique template, item, and step identities", () => {
    const ids = new Set<string>();
    for (const template of SYSTEM_TEMPLATES) {
      const structure = activityPlanStructureSchema.parse(template.structure);
      expect(structure.version).toBe(5);
      expect("adaptation" in template).toBe(false);
      expect(ids.has(template.id), template.name).toBe(false);
      ids.add(template.id);
      const nestedIds = structureIds(structure);
      expect(new Set(nestedIds).size, template.name).toBe(nestedIds.length);
    }
  });

  it("keeps the three reference assessments distinct, metric, and manually measured", () => {
    const assessments = REFERENCE_ASSESSMENT_TEMPLATE_IDS.map((id) =>
      required(
        SYSTEM_TEMPLATES.find((template) => template.id === id),
        `assessment ${id}`,
      ),
    );
    expect(assessments.map((assessment) => assessment.name)).toEqual([
      "Cycling FTP Assessment",
      "Running Threshold Pace Assessment",
      "Swimming CSS Assessment — 400 m / 200 m",
    ]);
    const steps = assessments.map((assessment) => structureSteps(assessment.structure));
    expect(steps[0]?.find((step) => step.name === "FTP test")?.duration).toEqual({
      type: "time",
      seconds: 1800,
    });
    expect(
      steps[1]?.filter((step) => step.name === "Threshold test").map((step) => step.duration),
    ).toEqual([
      { type: "time", seconds: 600 },
      { type: "time", seconds: 1200 },
    ]);
    expect(steps[1]?.some((step) => step.name?.includes("10 minutes"))).toBe(false);
    expect(
      steps[1]?.find((step) => step.duration.type === "time" && step.duration.seconds === 1200)
        ?.instructions,
    ).toContain("average heart rate for this final 20-minute interval");
    expect(
      steps[2]?.filter((step) => step.name === "Time trial").map((step) => step.duration),
    ).toEqual([
      { type: "distance", meters: 400 },
      { type: "distance", meters: 200 },
    ]);
    expect(assessments.map((assessment) => assessment.description)).toEqual([
      expect.stringContaining("average power for 30 min"),
      expect.stringContaining("30 min ÷ distance in km (6 km → 5:00/km)"),
      expect.stringContaining("CSS = (400 m time − 200 m time) ÷ 2"),
    ]);
    expect(assessments[1]?.description).toContain("average of final 20 min");
    expect(assessments[2]?.description).toContain("7:00 and 3:20 → 1:50/100 m");
    expect(getReferenceAssessmentMetadata(REFERENCE_ASSESSMENT_TEMPLATE_IDS[2])).toEqual({
      sourceUrl: "https://www.myprocoach.net/calculators/critical-swim-speed/",
      templateId: REFERENCE_ASSESSMENT_TEMPLATE_IDS[2],
    });
    expect(Object.isFrozen(REFERENCE_ASSESSMENT_METADATA_BY_ID)).toBe(true);
    expect(
      Object.isFrozen(REFERENCE_ASSESSMENT_METADATA_BY_ID[REFERENCE_ASSESSMENT_TEMPLATE_IDS[2]]),
    ).toBe(true);
  });

  it("builds normalized taxonomy entries for every shipped template", () => {
    const catalog = buildSystemActivityTemplateCatalog();
    expect(catalog).toHaveLength(68);
    expect(new Set(catalog.map((entry) => entry.template_id)).size).toBe(68);
    expect(
      catalog.every(
        (entry) => entry.source_file && entry.execution_context && entry.session_archetype,
      ),
    ).toBe(true);
    expect(
      catalog.find(
        (entry) => entry.template_id === required(OTHER_THRESHOLD_ROW.id, "other threshold id"),
      ),
    ).toMatchObject({ activity_category: "other", session_archetype: "threshold" });
  });

  it("retires all simple templates and all built-in training plans from active registries", () => {
    expect(RETIRED_SYSTEM_ACTIVITY_TEMPLATE_IDS).toHaveLength(19);
    expect(
      SYSTEM_TEMPLATES.some((template) => RETIRED_SYSTEM_ACTIVITY_TEMPLATE_IDS.has(template.id)),
    ).toBe(false);
    expect(RETIRED_SYSTEM_TRAINING_PLAN_IDS).toHaveLength(6);
    expect(ALL_SAMPLE_PLANS).toEqual([]);
  });

  it("keeps all training-plan structures valid and references resolvable", () => {
    const index = buildSystemTemplateIndex();
    for (const plan of ALL_SAMPLE_PLANS) {
      expect(() => persistedTrainingPlanStructureSchema.parse(plan.structure)).not.toThrow();
      expect(() => trainingPlanSchema.parse(plan.structure)).not.toThrow();
      expect(() => assertSystemTrainingPlanTemplateLinksResolved(plan, index)).not.toThrow();
    }
  });

  it("keeps V5 fixture builder identities stable without deriving them from display labels", () => {
    const build = (name: string) =>
      createSystemActivityPlanBuilder("run", "editorial-rename-golden")
        .step({
          name,
          duration: { type: "time", seconds: 60 },
          targets: [{ type: "RPE", intensity: 4 }],
        })
        .build();
    const before = build("Original editorial name");
    const after = build("Renamed editorial label");
    expect(before.items[0]?.id).toBe(after.items[0]?.id);
  });

  it("retains V5 identity and source signatures as a reviewable catalog golden", () => {
    const identityManifest = SYSTEM_TEMPLATES.map((template) => ({
      id: template.id,
      items: structureIds(template.structure),
    })).sort((left, right) => left.id.localeCompare(right.id));
    expect(
      createHash("sha256").update(JSON.stringify(identityManifest)).digest("hex"),
    ).toHaveLength(64);
  });

  it("does not ship retired multisport component plans", () => {
    expect(SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES).toEqual([]);
  });

  it("keeps track movement distance based with explicit timed rests and accepts normalized structure comparison", () => {
    let timedRestCount = 0;
    for (const template of SYSTEM_TRACK_RUN_WORKOUTS) {
      for (const step of structureSteps(template.structure)) {
        if (step.targets.some((target) => target.type === "rest")) {
          timedRestCount++;
          expect(step.targets).toEqual([{ type: "rest" }]);
          expect(step.duration).toEqual({
            type: "time",
            seconds: template.name === "Track 400m Repeats" ? 60 : 90,
          });
        } else expect(step.duration.type).toBe("distance");
      }
    }
    expect(timedRestCount).toBe(5);
    const template = required(SYSTEM_TEMPLATES[0], "template fixture");
    const changedIds = structuredClone(template.structure);
    const firstItem = required(changedIds.items[0], "item fixture");
    const firstStep =
      firstItem.type === "repeat" ? required(firstItem.steps[0], "step fixture") : firstItem;
    firstItem.id = "11111111-1111-4111-8111-111111111111";
    firstStep.id = "22222222-2222-4222-8222-222222222222";
    expect(normalizeActivityTemplateStructureForAudit(changedIds)).toEqual(
      normalizeActivityTemplateStructureForAudit(template.structure),
    );
  });

  it("materializes each declared plan week through its final session", () => {
    for (const plan of ALL_SAMPLE_PLANS) {
      const weeks = plan.structure.durationWeeks?.recommended;
      if (!weeks) throw new Error(`${plan.name} missing duration`);
      const covered = new Set(
        plan.structure.sessions.map((session) => Math.floor(session.offset_days / 7)),
      );
      expect(covered).toEqual(new Set(Array.from({ length: weeks }, (_, index) => index)));
      const events = materializePlanToEvents(plan.structure, "2026-01-01", "UTC");
      expect(events.length).toBe(plan.structure.sessions.length);
    }
  });
});
