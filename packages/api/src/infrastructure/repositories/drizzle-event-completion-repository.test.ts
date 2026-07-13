import { describe, expect, it, vi } from "vitest";
import { createEventCompletionRepository } from "./drizzle-event-completion-repository";

function createDeleteDb() {
  const operations: string[] = [];
  const tx = {
    select: vi.fn(() => ({
      from: () => ({
        where: async () => {
          operations.push("select-candidates");
          return [{ activity_plan_id: null, event_type: "custom", id: "event-1" }];
        },
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: async () => {
          operations.push("detach-occurrences");
        },
      }),
    })),
    delete: vi.fn(() => ({
      where: async () => {
        operations.push("delete-events");
      },
    })),
  };
  const db = {
    transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { db, operations };
}

describe("event completion repository deletion scopes", () => {
  it("detaches occurrences before deleting a series root with single scope", async () => {
    const { db, operations } = createDeleteDb();
    const repository = createEventCompletionRepository(db as never);

    await repository.deleteOwnedEventsForScope({
      anchorEvent: {
        id: "event-1",
        series_id: null,
        starts_at: "2026-07-12T08:00:00.000Z",
        training_plan_id: null,
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      profileId: "profile-1",
      scope: "single",
    });

    expect(operations).toEqual(["select-candidates", "detach-occurrences", "delete-events"]);
  });

  it("deletes one occurrence without detaching its siblings", async () => {
    const { db, operations } = createDeleteDb();
    const repository = createEventCompletionRepository(db as never);

    await repository.deleteOwnedEventsForScope({
      anchorEvent: {
        id: "event-2",
        series_id: "event-1",
        starts_at: "2026-07-13T08:00:00.000Z",
        training_plan_id: null,
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      profileId: "profile-1",
      scope: "single",
    });

    expect(operations).toEqual(["select-candidates", "delete-events"]);
  });

  it("lets the explicit series scope delete the root and occurrences together", async () => {
    const { db, operations } = createDeleteDb();
    const repository = createEventCompletionRepository(db as never);

    await repository.deleteOwnedEventsForScope({
      anchorEvent: {
        id: "event-1",
        series_id: null,
        starts_at: "2026-07-12T08:00:00.000Z",
        training_plan_id: null,
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      profileId: "profile-1",
      scope: "series",
    });

    expect(operations).toEqual(["select-candidates", "delete-events"]);
  });
});
