import { describe, expect, it } from "vitest";

import { SYSTEM_TEMPLATES, type SystemTrainingPlanTemplate } from "../../samples";
import {
  buildSystemActivityTemplateCatalog,
  normalizeActivityTemplateStructureForAudit,
} from "../verification/activityTemplateCatalog";
import {
  assertSystemTrainingPlanTemplateLinksResolved,
  buildSystemTemplateIndex,
} from "../verification/systemPlanAudit";

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
    const template = SYSTEM_TEMPLATES[0]!;
    const modifiedStructure = structuredClone(template.structure);

    modifiedStructure.intervals[0]!.id = "11111111-1111-4111-8111-111111111111";
    modifiedStructure.intervals[0]!.steps[0]!.id = "22222222-2222-4222-8222-222222222222";

    expect(normalizeActivityTemplateStructureForAudit(modifiedStructure)).toEqual(
      normalizeActivityTemplateStructureForAudit(template.structure),
    );
  });

  it("throws explicitly when a shipped system plan has unresolved linked templates", () => {
    const templateIndex = buildSystemTemplateIndex();
    const validTemplateId = SYSTEM_TEMPLATES[0]!.id;
    const partialPlan: SystemTrainingPlanTemplate = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Partial Missing Plan",
      description: "test",
      sessions_per_week_target: 2,
      duration_hours: 1,
      structure: {
        version: 1,
        start_date: "2026-01-05",
        sessions: [
          {
            offset_days: 0,
            title: "Resolved",
            session_type: "planned",
            activity_plan_id: validTemplateId,
          },
          {
            offset_days: 2,
            title: "Missing",
            session_type: "planned",
            activity_plan_id: "00000000-0000-4000-8000-000000000099",
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
        start_date: "2026-01-05",
        sessions: [
          {
            offset_days: 0,
            title: "Missing A",
            session_type: "planned",
            activity_plan_id: "00000000-0000-4000-8000-000000000100",
          },
          {
            offset_days: 2,
            title: "Missing B",
            session_type: "planned",
            activity_plan_id: "00000000-0000-4000-8000-000000000101",
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
