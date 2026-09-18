import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../../activity-plan";

import {
  ALL_SAMPLE_PLANS,
  getSystemActivityTemplateDefinitions,
  getSystemTrainingPlanDefinitions,
  OTHER_LONG_ENDURANCE_ELLIPTICAL,
  OTHER_THRESHOLD_ROW,
  SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES,
  SYSTEM_TEMPLATES,
  SYSTEM_TRACK_RUN_WORKOUTS,
  type SystemTrainingPlanTemplate,
} from "../../samples";
import { createSystemActivityPlanBuilder } from "../../samples/activity-plan-builder";
import { persistedTrainingPlanStructureSchema, trainingPlanSchema } from "../../schemas";
import { materializePlanToEvents } from "../materializePlanToEvents";
import { resolvePrescription } from "../prescriptionResolution";
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
  it("exposes stable, versioned, deterministic content definitions", async () => {
    const firstActivityDefinitions = await getSystemActivityTemplateDefinitions();
    const secondActivityDefinitions = await getSystemActivityTemplateDefinitions();
    const trainingDefinitions = await getSystemTrainingPlanDefinitions();

    expect(firstActivityDefinitions).toEqual(secondActivityDefinitions);
    expect(firstActivityDefinitions).toHaveLength(SYSTEM_TEMPLATES.length);
    expect(trainingDefinitions).toHaveLength(ALL_SAMPLE_PLANS.length);
    const definitions = [...firstActivityDefinitions, ...trainingDefinitions];
    expect(new Set(definitions.map((definition) => definition.key)).size).toBe(definitions.length);
    expect(definitions.every((definition) => definition.version === 1)).toBe(true);
    expect(
      definitions.every((definition) => /^v1:sha256:[0-9a-f]{64}$/.test(definition.contentHash)),
    ).toBe(true);
  });

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

  it("limits duration objectives to templates with curator-authored adaptation controls", () => {
    const adaptiveIds = new Set([
      "1b4c5d6e-7f8a-4b0c-9d2e-3f4a5b6c7d8e",
      "3b6c7d8e-9f0a-4b2c-bd4e-5f6a7b8c9d0e",
      "8c1d2e3f-4a5b-4c7d-8e9f-0a1b2c3d4e5f",
    ]);
    for (const plan of ALL_SAMPLE_PLANS) {
      expect(
        plan.structure.sessions.every((session) => {
          const targetDuration = session.demand.target_duration_minutes;
          return (
            targetDuration === null ||
            (targetDuration > 0 &&
              typeof session.activity_plan_id === "string" &&
              adaptiveIds.has(session.activity_plan_id))
          );
        }),
        plan.name,
      ).toBe(true);
    }

    const cycling = required(
      ALL_SAMPLE_PLANS.find((plan) => plan.name === "Cycling Endurance Builder (12 weeks)"),
      "missing cycling template",
    );
    const enduranceRides = cycling.structure.sessions.filter(
      (session) => session.event_overrides?.title === "Endurance Ride",
    );
    const recoveryWeekRide = cycling.structure.sessions.find(
      (session) =>
        session.offset_days === 22 && session.event_overrides?.title === "Endurance Ride",
    );

    expect(enduranceRides[1]?.demand.target_duration_minutes).toBeGreaterThan(
      enduranceRides[0]?.demand.target_duration_minutes ?? 0,
    );
    expect(recoveryWeekRide?.demand.target_duration_minutes).toBeLessThan(
      enduranceRides[2]?.demand.target_duration_minutes ?? Number.POSITIVE_INFINITY,
    );
  });

  it("adapts only the three curated steady templates without changing their defaults", () => {
    const specifications = [
      {
        id: "1b4c5d6e-7f8a-4b0c-9d2e-3f4a5b6c7d8e",
        category: "run" as const,
        intent: "recovery" as const,
        minutes: [25, 30, 35] as const,
      },
      {
        id: "3b6c7d8e-9f0a-4b2c-bd4e-5f6a7b8c9d0e",
        category: "run" as const,
        intent: "aerobic_base" as const,
        minutes: [25, 30, 35] as const,
      },
      {
        id: "8c1d2e3f-4a5b-4c7d-8e9f-0a1b2c3d4e5f",
        category: "bike" as const,
        intent: "aerobic_base" as const,
        minutes: [50, 60, 70] as const,
      },
    ];

    for (const specification of specifications) {
      const template = required(
        SYSTEM_TEMPLATES.find((candidate) => candidate.id === specification.id),
        `missing curated adaptive template ${specification.id}`,
      );
      const resolve = (target_duration_minutes: number) =>
        resolvePrescription({
          demand: {
            activity_category: specification.category,
            training_intent: specification.intent,
            target_duration_minutes,
            target_common_load: null,
            importance: "normal",
          },
          activity_plan_id: template.id,
          preferences: {
            weekly_session_count: null,
            target_weekly_duration_minutes: null,
            maximum_session_duration_minutes: null,
            preferred_weekdays: [],
            rest_days: [],
            progression_style: null,
            recovery_priority: null,
          },
          baseline: { status: "no_context", as_of: "2026-06-01T00:00:00.000Z" },
          candidates: [
            {
              id: template.id,
              revision: 1,
              semantic_hash: `v1:sha256:${"0".repeat(64)}`,
              activity_category: template.structure.activity_category,
              training_intent: template.training_intent,
              structure: template.structure,
              adaptation: template.adaptation,
            },
          ],
        });

      const reduced = resolve(specification.minutes[0]);
      const defaultDose = resolve(specification.minutes[1]);
      const build = resolve(specification.minutes[2]);
      expect(reduced.status).toBe("resolved");
      expect(defaultDose.status).toBe("resolved");
      expect(build.status).toBe("resolved");
      if (
        reduced.status !== "resolved" ||
        defaultDose.status !== "resolved" ||
        build.status !== "resolved"
      ) {
        throw new Error(`Unable to resolve ${template.name}`);
      }

      expect(defaultDose.manifest.resolved_structure).toEqual(template.structure);
      expect(reduced.manifest.resolved_structure_hash).not.toBe(
        build.manifest.resolved_structure_hash,
      );
      expect(reduced.manifest.resolved_structure.activity_category).toBe(
        template.structure.activity_category,
      );
      const reducedSegment = reduced.manifest.resolved_structure.segments[0];
      const buildSegment = build.manifest.resolved_structure.segments[0];
      if (reducedSegment?.role !== "activity" || buildSegment?.role !== "activity") {
        throw new Error(`Missing activity segment for ${template.name}`);
      }
      expect(reducedSegment.intervals[0]?.steps[0]?.targets).toEqual(
        buildSegment.intervals[0]?.steps[0]?.targets,
      );
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
        activity_category?: string[];
      };

      expect(Array.isArray(structure.activity_category)).toBe(true);
      expect(structure.activity_category?.length).toBeGreaterThan(0);
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
      expect(() => activityPlanStructureSchema.parse(template.structure)).not.toThrow();
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

    expect(identityHash).toBe("47bf4c1c895f81bb234bf8fc8b7dda4fca4251b21b8b9a06f2384862be12c976");
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

  it("ships single-activity-category replacement components and exact other projection coverage", () => {
    const catalog = buildSystemActivityTemplateCatalog();
    const byId = new Map(catalog.map((entry) => [entry.template_id, entry]));

    expect(SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES).toHaveLength(6);
    expect(
      SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES.every(
        (template) => activityPlanStructureSchema.safeParse(template.structure).success,
      ),
    ).toBe(true);
    expect(byId.get(required(OTHER_THRESHOLD_ROW.id, "missing other threshold id"))).toMatchObject({
      activity_category: "other",
      session_archetype: "threshold",
      training_intent: "threshold_development",
    });
    expect(
      byId.get(required(OTHER_LONG_ENDURANCE_ELLIPTICAL.id, "missing other long endurance id")),
    ).toMatchObject({
      activity_category: "other",
      session_archetype: "long_endurance",
      training_intent: "durable_endurance",
    });
  });

  it("schedules independent single-activity-category components on each same-day base session", () => {
    const triathlon = ALL_SAMPLE_PLANS.find((plan) => plan.name.startsWith("Sprint Triathlon"));
    const componentIds = new Set(SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES.map((plan) => plan.id));
    const componentSessions = triathlon?.structure.sessions.filter((session) =>
      componentIds.has(session.activity_plan_id ?? undefined),
    );
    expect(componentSessions).toHaveLength(30);
    expect(componentSessions?.every((session) => session.offset_days % 7 === 6)).toBe(true);
    expect(
      componentSessions?.reduce((counts, session) => {
        counts.set(session.offset_days, (counts.get(session.offset_days) ?? 0) + 1);
        return counts;
      }, new Map<number, number>()),
    ).toEqual(new Map(Array.from({ length: 10 }, (_, week) => [week * 7 + 6, 3])));
  });

  it("keeps every shipped system activity template executable", () => {
    for (const template of SYSTEM_TEMPLATES) {
      expect(activityPlanStructureSchema.safeParse(template.structure).success).toBe(true);
    }
  });

  it("keeps shipped track run activities distance-based", () => {
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

  it("keeps normalized template ids unique independently of editable names", () => {
    const catalog = buildSystemActivityTemplateCatalog();
    expect(new Set(catalog.map((entry) => entry.template_id)).size).toBe(catalog.length);
    expect(catalog.every((entry) => entry.duplicate_name_count >= 1)).toBe(true);
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
        plan_preferences: {
          weekly_session_count: null,
          target_weekly_duration_minutes: null,
          maximum_session_duration_minutes: null,
          preferred_weekdays: [],
          rest_days: [],
          progression_style: null,
          recovery_priority: null,
        },
        sessions: [
          {
            id: "00000000-0000-4000-8000-000000000011",
            offset_days: 0,
            activity_plan_id: validTemplateId,
            demand: {
              activity_category: "run",
              training_intent: "aerobic_base",
              target_duration_minutes: null,
              target_common_load: null,
              importance: "normal",
            },
            event_overrides: { title: "Resolved" },
          },
          {
            id: "00000000-0000-4000-8000-000000000012",
            offset_days: 2,
            activity_plan_id: "00000000-0000-4000-8000-000000000099",
            demand: {
              activity_category: "run",
              training_intent: "aerobic_base",
              target_duration_minutes: null,
              target_common_load: null,
              importance: "normal",
            },
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
        plan_preferences: {
          weekly_session_count: null,
          target_weekly_duration_minutes: null,
          maximum_session_duration_minutes: null,
          preferred_weekdays: [],
          rest_days: [],
          progression_style: null,
          recovery_priority: null,
        },
        sessions: [
          {
            id: "00000000-0000-4000-8000-000000000013",
            offset_days: 0,
            activity_plan_id: "00000000-0000-4000-8000-000000000100",
            demand: {
              activity_category: "run",
              training_intent: "aerobic_base",
              target_duration_minutes: null,
              target_common_load: null,
              importance: "normal",
            },
            event_overrides: { title: "Missing A" },
          },
          {
            id: "00000000-0000-4000-8000-000000000014",
            offset_days: 2,
            activity_plan_id: "00000000-0000-4000-8000-000000000101",
            demand: {
              activity_category: "run",
              training_intent: "aerobic_base",
              target_duration_minutes: null,
              target_common_load: null,
              importance: "normal",
            },
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
