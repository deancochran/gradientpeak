import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { activityPlanStructureSchemaV3 } from "../../activity-plan";

import {
  ALL_SAMPLE_PLANS,
  OTHER_LONG_ENDURANCE_ELLIPTICAL,
  OTHER_THRESHOLD_ROW,
  RUN_BIKE_RUN_TRANSITION_PRACTICE,
  SPRINT_TRIATHLON_BRICK,
  SYSTEM_TEMPLATES,
  SYSTEM_TRACK_RUN_WORKOUTS,
  type SystemTrainingPlanTemplate,
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

describe("system activity-template catalog", () => {
  it("builds a normalized catalog for every current system template", () => {
    const catalog = buildSystemActivityTemplateCatalog();

    expect(catalog).toHaveLength(SYSTEM_TEMPLATES.length);
    expect(new Set(catalog.map((entry) => entry.template_id)).size).toBe(SYSTEM_TEMPLATES.length);
    expect(
      catalog.every(
        (entry) =>
          entry.source_file.length > 0 &&
          entry.execution_context.length > 0 &&
          entry.session_archetype.length > 0,
      ),
    ).toBe(true);
  });

  it("accepts every shipped system training plan as a persisted compatible structure", () => {
    for (const plan of ALL_SAMPLE_PLANS) {
      expect(() => persistedTrainingPlanStructureSchema.parse(plan.structure)).not.toThrow();
    }
  });

  it("spans every declared training week through the intended final week", () => {
    for (const plan of ALL_SAMPLE_PLANS) {
      const declaredWeeks = plan.structure.durationWeeks?.recommended;
      if (!declaredWeeks) throw new Error(`${plan.name} is missing durationWeeks.recommended`);
      const coveredWeeks = new Set(
        plan.structure.sessions.map((session) => Math.floor(session.offset_days / 7)),
      );
      const maxOffset = Math.max(...plan.structure.sessions.map((session) => session.offset_days));

      expect(coveredWeeks, plan.name).toEqual(
        new Set(Array.from({ length: declaredWeeks }, (_, i) => i)),
      );
      expect(Math.floor(maxOffset / 7) + 1, plan.name).toBe(declaredWeeks);

      const targetDate = new Date("2027-01-31T00:00:00.000Z");
      targetDate.setUTCDate(targetDate.getUTCDate() - maxOffset);
      const startDate = targetDate.toISOString().slice(0, 10);
      const appliedEvents = materializePlanToEvents(plan.structure, startDate, "UTC");
      expect(appliedEvents.at(-1)?.scheduled_date, plan.name).toBe("2027-01-31");
    }
  });

  it("ships UI metadata for every system training plan template", () => {
    for (const plan of ALL_SAMPLE_PLANS) {
      const structure = plan.structure as {
        durationWeeks?: { recommended?: number };
        experienceLevel?: string[];
        sport?: string[];
      };

      expect(Array.isArray(structure.sport)).toBe(true);
      expect(structure.sport?.length).toBeGreaterThan(0);
      expect(Array.isArray(structure.experienceLevel)).toBe(true);
      expect(structure.experienceLevel?.length).toBeGreaterThan(0);
      expect(structure.durationWeeks?.recommended).toBeGreaterThan(0);
    }
  });

  it("keeps every shipped system training plan current-schema compatible", () => {
    for (const plan of ALL_SAMPLE_PLANS) {
      expect(() => trainingPlanSchema.parse(plan.structure)).not.toThrow();
    }
  });

  it("keeps every shipped system activity template current-schema compatible", () => {
    for (const template of SYSTEM_TEMPLATES) {
      expect(template.version).toBe("3.0");
      expect(() => activityPlanStructureSchemaV3.parse(template.structure)).not.toThrow();
    }
  });

  it("keeps the durable activity and nested identity manifest golden", () => {
    const identityManifest = SYSTEM_TEMPLATES.map((template) => ({
      id: template.id,
      segments: template.structure.segments.map((segment) =>
        segment.role === "activity"
          ? {
              id: segment.id,
              intervals: segment.intervals.map((interval) => ({
                id: interval.id,
                steps: interval.steps.map((step) => step.id),
              })),
            }
          : { id: segment.id },
      ),
    })).sort((left, right) => left.id.localeCompare(right.id));
    const identityHash = createHash("sha256")
      .update(JSON.stringify(identityManifest))
      .digest("hex");

    expect(identityHash).toBe("b81df7b23209d366345aa0520678321d24f53c203fd8599c69fd6efe294e33c3");
  });

  it("does not derive nested IDs from editable display names", () => {
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

    expect(before.segments[0]?.id).toBe(after.segments[0]?.id);
    const beforeActivity = before.segments[0];
    const afterActivity = after.segments[0];
    if (beforeActivity?.role !== "activity" || afterActivity?.role !== "activity") {
      throw new Error("expected activity segments");
    }
    expect(beforeActivity.intervals[0]?.id).toBe(afterActivity.intervals[0]?.id);
    expect(beforeActivity.intervals[0]?.steps[0]?.id).toBe(
      afterActivity.intervals[0]?.steps[0]?.id,
    );
  });

  it("ships canonical multisport composition and exact other projection coverage", () => {
    const catalog = buildSystemActivityTemplateCatalog();
    const byId = new Map(catalog.map((entry) => [entry.template_id, entry]));

    expect(
      byId.get(required(SPRINT_TRIATHLON_BRICK.id, "missing sprint triathlon brick id"))
        ?.category_composition,
    ).toEqual(["swim", "bike", "run"]);
    expect(
      byId.get(required(RUN_BIKE_RUN_TRANSITION_PRACTICE.id, "missing duathlon brick id"))
        ?.category_composition,
    ).toEqual(["run", "bike", "run"]);
    expect(byId.get(required(OTHER_THRESHOLD_ROW.id, "missing other threshold id"))).toMatchObject({
      sport: "other",
      session_archetype: "threshold",
      training_intent: "threshold_development",
    });
    expect(
      byId.get(required(OTHER_LONG_ENDURANCE_ELLIPTICAL.id, "missing other long endurance id")),
    ).toMatchObject({
      sport: "other",
      session_archetype: "long_endurance",
      training_intent: "durable_endurance",
    });
  });

  it("uses the new multisport IDs for the full weekly brick progression", () => {
    const triathlon = ALL_SAMPLE_PLANS.find((plan) => plan.name.startsWith("Sprint Triathlon"));
    const brickSessions = triathlon?.structure.sessions.filter((session) =>
      [SPRINT_TRIATHLON_BRICK.id, RUN_BIKE_RUN_TRANSITION_PRACTICE.id].includes(
        session.activity_plan_id,
      ),
    );
    expect(brickSessions).toHaveLength(10);
    expect(brickSessions?.every((session) => session.offset_days % 7 === 6)).toBe(true);
  });

  it("keeps shipped track run workouts distance-based", () => {
    expect(SYSTEM_TRACK_RUN_WORKOUTS.length).toBeGreaterThan(0);

    for (const template of SYSTEM_TRACK_RUN_WORKOUTS) {
      for (const segment of template.structure.segments) {
        if (segment.role === "activity") {
          for (const interval of segment.intervals) {
            for (const step of interval.steps) {
              expect(step.duration.type).toBe("distance");
            }
          }
        }
      }
    }
  });

  it("uses normalized ids instead of names when duplicate names exist", () => {
    const catalog = buildSystemActivityTemplateCatalog();
    const duplicateNameGroups = Array.from(
      catalog.reduce((groups, entry) => {
        const group = groups.get(entry.template_name) ?? [];
        group.push(entry);
        groups.set(entry.template_name, group);
        return groups;
      }, new Map<string, Array<(typeof catalog)[number]>>()),
    ).filter(([, entries]) => entries.length > 1);

    expect(duplicateNameGroups.map(([templateName]) => templateName)).toContain(
      "Sweet Spot Intervals",
    );
    expect(
      duplicateNameGroups.every(
        ([, entries]) =>
          new Set(entries.map((entry) => entry.template_id)).size === entries.length &&
          entries.every((entry) => entry.duplicate_name_count === entries.length),
      ),
    ).toBe(true);
  });

  it("ignores generated nested structure ids during audit comparisons", () => {
    const template = required(SYSTEM_TEMPLATES[0], "missing system template fixture");
    const modifiedStructure = structuredClone(template.structure);

    const firstSegment = required(modifiedStructure.segments[0], "missing segment fixture");
    if (firstSegment.role !== "activity") throw new Error("expected activity segment");
    const firstInterval = required(firstSegment.intervals[0], "missing interval fixture");
    firstInterval.id = "11111111-1111-4111-8111-111111111111";
    required(firstInterval.steps[0], "missing step fixture").id =
      "22222222-2222-4222-8222-222222222222";

    expect(normalizeActivityTemplateStructureForAudit(modifiedStructure)).toEqual(
      normalizeActivityTemplateStructureForAudit(template.structure),
    );
  });

  it("throws explicitly when a shipped system plan has unresolved linked templates", () => {
    const templateIndex = buildSystemTemplateIndex();
    const validTemplateId = required(SYSTEM_TEMPLATES[0], "missing system template fixture").id;
    const partialPlan: SystemTrainingPlanTemplate = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Partial Missing Plan",
      description: "test",
      sessions_per_week_target: 2,
      duration_hours: 1,
      structure: {
        version: 1,
        id: "00000000-0000-4000-8000-000000000001",
        sessions: [
          {
            offset_days: 0,
            activity_plan_id: validTemplateId,
            event_overrides: { title: "Resolved" },
          },
          {
            offset_days: 2,
            activity_plan_id: "00000000-0000-4000-8000-000000000099",
            event_overrides: { title: "Missing" },
          },
        ],
      },
    };
    const fullMissingPlan: SystemTrainingPlanTemplate = {
      ...partialPlan,
      id: "00000000-0000-4000-8000-000000000002",
      name: "Full Missing Plan",
      structure: {
        version: 1,
        id: "00000000-0000-4000-8000-000000000002",
        sessions: [
          {
            offset_days: 0,
            activity_plan_id: "00000000-0000-4000-8000-000000000100",
            event_overrides: { title: "Missing A" },
          },
          {
            offset_days: 2,
            activity_plan_id: "00000000-0000-4000-8000-000000000101",
            event_overrides: { title: "Missing B" },
          },
        ],
      },
    };

    expect(() => assertSystemTrainingPlanTemplateLinksResolved(partialPlan, templateIndex)).toThrow(
      /00000000-0000-4000-8000-000000000099/,
    );
    expect(() =>
      assertSystemTrainingPlanTemplateLinksResolved(fullMissingPlan, templateIndex),
    ).toThrow(/00000000-0000-4000-8000-000000000100, 00000000-0000-4000-8000-000000000101/);
  });
});
