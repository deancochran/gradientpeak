import { buildSystemActivityTemplateCatalog, SYSTEM_TEMPLATES } from "@repo/core";
import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it, vi } from "vitest";
import { createPlanningTemplateRepository } from "./drizzle-planning-template-repository";

describe("createPlanningTemplateRepository", () => {
  it("accepts only strict V3 rows matching the in-code catalog fingerprint", async () => {
    const catalog = buildSystemActivityTemplateCatalog();
    const first = catalog[0];
    const second = catalog[1];
    if (!first || !second) throw new Error("Expected system template catalog fixtures");
    const sourceById = new Map(SYSTEM_TEMPLATES.map((template) => [template.id, template]));
    const execute = vi.fn(async () => ({
      rows: [
        {
          id: second.template_id,
          activity_category: sourceById.get(second.template_id)?.activity_category,
          gps_recording_enabled: sourceById.get(second.template_id)?.gps_recording_enabled,
          structure: sourceById.get(second.template_id)?.structure,
          version: "3.0",
        },
        {
          id: first.template_id,
          activity_category: sourceById.get(first.template_id)?.activity_category,
          gps_recording_enabled: sourceById.get(first.template_id)?.gps_recording_enabled,
          structure: sourceById.get(first.template_id)?.structure,
          version: "3.0",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          activity_category: "run",
          gps_recording_enabled: true,
          structure: { version: 2, intervals: [] },
          version: "2.0",
        },
        {
          id: first.template_id,
          activity_category: sourceById.get(first.template_id)?.activity_category,
          gps_recording_enabled: sourceById.get(first.template_id)?.gps_recording_enabled,
          structure: { version: 3, segments: [] },
          version: "3.0",
        },
      ],
    }));
    const repository = createPlanningTemplateRepository({ execute } as unknown as DrizzleDbClient);

    await expect(repository.listAvailablePublicSystemTemplateIds()).resolves.toEqual(
      [first.template_id, second.template_id].sort(),
    );
    await expect(
      repository.assertAvailablePublicSystemTemplateIds([
        "33333333-3333-4333-8333-333333333333",
        first.template_id,
      ]),
    ).resolves.toEqual({
      availableIds: [first.template_id],
      missingIds: ["33333333-3333-4333-8333-333333333333"],
    });
  });

  it("does not run the persistence callback when a locked template changed after preview", async () => {
    const candidate = buildSystemActivityTemplateCatalog()[0];
    if (!candidate) throw new Error("Expected system template catalog fixture");
    const execute = vi.fn(async () => ({
      rows: [
        {
          id: candidate.template_id,
          is_system_template: true,
          activity_category: candidate.sport,
          gps_recording_enabled: true,
          structure: { version: 3, segments: [] },
          version: "3.0",
        },
      ],
    }));
    const db = {
      execute,
      transaction: vi.fn(async (operation: (tx: { execute: typeof execute }) => Promise<unknown>) =>
        operation({ execute }),
      ),
    } as unknown as DrizzleDbClient;
    const repository = createPlanningTemplateRepository(db);
    const persist = vi.fn(async () => ({ id: "should-not-persist" }));

    await expect(
      repository.withLockedPublishedTemplates([candidate.template_id], persist),
    ).rejects.toThrow("changed activity plans");
    expect(persist).not.toHaveBeenCalled();
  });

  it("marks strict V3 system rows unavailable when execution metadata differs", async () => {
    const candidate = buildSystemActivityTemplateCatalog()[0];
    const source = SYSTEM_TEMPLATES.find((template) => template.id === candidate?.template_id);
    if (!candidate || !source) throw new Error("Expected system template fixture");
    const execute = vi.fn(async () => ({
      rows: [
        {
          id: candidate.template_id,
          activity_category: source.activity_category,
          gps_recording_enabled: !source.gps_recording_enabled,
          structure: source.structure,
          version: "3.0",
        },
      ],
    }));
    const repository = createPlanningTemplateRepository({ execute } as unknown as DrizzleDbClient);

    await expect(repository.listAvailablePublicSystemTemplateIds()).resolves.toEqual([]);
  });

  it("marks a strict V3 structure unavailable when the persisted row version is stale", async () => {
    const candidate = buildSystemActivityTemplateCatalog()[0];
    const source = SYSTEM_TEMPLATES.find((template) => template.id === candidate?.template_id);
    if (!candidate || !source) throw new Error("Expected system template fixture");
    const execute = vi.fn(async () => ({
      rows: [
        {
          id: candidate.template_id,
          activity_category: source.activity_category,
          gps_recording_enabled: source.gps_recording_enabled,
          structure: source.structure,
          version: "2.0",
        },
      ],
    }));
    const repository = createPlanningTemplateRepository({ execute } as unknown as DrizzleDbClient);

    await expect(repository.listAvailablePublicSystemTemplateIds()).resolves.toEqual([]);
  });
});
