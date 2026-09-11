import { SYSTEM_TEMPLATES } from "@repo/core";
import { initializeActivityPlanDocument } from "@repo/core/activity-plan";
import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it, vi } from "vitest";
import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { createPlanningTemplateRepository } from "./drizzle-planning-template-repository";

function systemDocument(templateId: string) {
  const source = SYSTEM_TEMPLATES.find((template) => template.id === templateId);
  if (!source) throw new Error("Expected system template fixture");
  return initializeActivityPlanDocument({ activityPlanId: source.id, structure: source.structure });
}

describe("createPlanningTemplateRepository", () => {
  it("accepts only strict rows matching the in-code catalog fingerprint", async () => {
    const firstSource = SYSTEM_TEMPLATES[0];
    const secondSource = SYSTEM_TEMPLATES[1];
    if (!firstSource || !secondSource) throw new Error("Expected system template catalog fixtures");
    const first = { template_id: firstSource.id };
    const second = { template_id: secondSource.id };
    const sourceById = new Map(SYSTEM_TEMPLATES.map((template) => [template.id, template]));
    const execute = vi.fn(async () => ({
      rows: [
        {
          id: second.template_id,
          gps_recording_enabled: sourceById.get(second.template_id)?.gps_recording_enabled,
          structure: systemDocument(second.template_id),
          structure_hash: activityPlanStructureHash(systemDocument(second.template_id)),
        },
        {
          id: first.template_id,
          gps_recording_enabled: sourceById.get(first.template_id)?.gps_recording_enabled,
          structure: systemDocument(first.template_id),
          structure_hash: activityPlanStructureHash(systemDocument(first.template_id)),
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          gps_recording_enabled: true,
          structure: { version: 2, intervals: [] },
          structure_hash: activityPlanStructureHash({ version: 2, intervals: [] }),
        },
        {
          id: first.template_id,
          gps_recording_enabled: sourceById.get(first.template_id)?.gps_recording_enabled,
          structure: { version: 3, segments: [] },
          structure_hash: activityPlanStructureHash({ version: 3, segments: [] }),
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
    const source = SYSTEM_TEMPLATES[0];
    if (!source) throw new Error("Expected system template catalog fixture");
    const candidate = { template_id: source.id };
    const execute = vi.fn(async () => ({
      rows: [
        {
          id: candidate.template_id,
          is_system_template: true,
          gps_recording_enabled: true,
          structure: { version: 3, segments: [] },
          structure_hash: activityPlanStructureHash({ version: 3, segments: [] }),
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
      repository.withLockedPublishedTemplates(
        "11111111-1111-4111-8111-111111111111",
        [candidate.template_id],
        persist,
      ),
    ).rejects.toThrow("changed activity plans");
    expect(persist).not.toHaveBeenCalled();
  });

  it("marks strict system rows unavailable when execution metadata differs", async () => {
    const source = SYSTEM_TEMPLATES[0];
    if (!source) throw new Error("Expected system template fixture");
    const candidate = { template_id: source.id };
    const execute = vi.fn(async () => ({
      rows: [
        {
          id: candidate.template_id,
          gps_recording_enabled: !source.gps_recording_enabled,
          structure: systemDocument(source.id),
          structure_hash: activityPlanStructureHash(systemDocument(source.id)),
        },
      ],
    }));
    const repository = createPlanningTemplateRepository({ execute } as unknown as DrizzleDbClient);

    await expect(repository.listAvailablePublicSystemTemplateIds()).resolves.toEqual([]);
  });

  it("rejects locked rows with invalid GPS persistence metadata", async () => {
    const source = SYSTEM_TEMPLATES[0];
    if (!source) throw new Error("Expected system template fixture");
    const candidate = { template_id: source.id };
    const execute = vi.fn(async () => ({
      rows: [
        {
          id: candidate.template_id,
          is_system_template: false,
          gps_recording_enabled: null,
          structure: systemDocument(source.id),
          structure_hash: activityPlanStructureHash(systemDocument(source.id)),
        },
      ],
    }));
    const db = {
      execute,
      transaction: vi.fn(async (operation: (tx: { execute: typeof execute }) => Promise<unknown>) =>
        operation({ execute }),
      ),
    } as unknown as DrizzleDbClient;

    await expect(
      createPlanningTemplateRepository(db).withLockedPublishedTemplates(
        "11111111-1111-4111-8111-111111111111",
        [candidate.template_id],
        vi.fn(),
      ),
    ).rejects.toThrow("changed activity plans");
  });

  it("marks a row unavailable when its canonical structure hash differs", async () => {
    const source = SYSTEM_TEMPLATES[0];
    if (!source) throw new Error("Expected system template fixture");
    const candidate = { template_id: source.id };
    const execute = vi.fn(async () => ({
      rows: [
        {
          id: candidate.template_id,
          gps_recording_enabled: source.gps_recording_enabled,
          structure: systemDocument(source.id),
          structure_hash: activityPlanStructureHash({ version: 3, segments: [] }),
        },
      ],
    }));
    const repository = createPlanningTemplateRepository({ execute } as unknown as DrizzleDbClient);

    await expect(repository.listAvailablePublicSystemTemplateIds()).resolves.toEqual([]);
  });
});
