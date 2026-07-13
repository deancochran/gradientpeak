import { describe, expect, it, vi } from "vitest";
import { createActivityAnalysisStore } from "../drizzle-activity-analysis-repository";

function getBulkLoader(store: ReturnType<typeof createActivityAnalysisStore>) {
  if (!store.loadContextEvidence) throw new Error("Expected bulk context evidence loader");
  return store.loadContextEvidence;
}

function createDbMock() {
  const select = vi.fn((fields: Record<string, unknown>) => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        if ("dob" in fields) return Promise.resolve([]);
        return { orderBy: vi.fn(() => Promise.resolve([])) };
      }),
    })),
  }));
  return { db: { select } as any, select };
}

describe("createActivityAnalysisStore", () => {
  it.each([
    1, 20, 100, 525,
  ])("uses three set-based database queries for %i context requests", async (requestCount) => {
    const { db, select } = createDbMock();
    const store = createActivityAnalysisStore(db);

    const result = await getBulkLoader(store)({
      requests: Array.from({ length: requestCount }, (_, index) => ({
        profileId: `profile-${index % 5}`,
        asOf: new Date(Date.UTC(2025, 0, 1) + index * 1000),
      })),
    });

    expect(select).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(Math.min(requestCount, 5));
  });

  it("does not query for an empty request set", async () => {
    const { db, select } = createDbMock();

    await expect(getBulkLoader(createActivityAnalysisStore(db))({ requests: [] })).resolves.toEqual(
      new Map(),
    );
    expect(select).not.toHaveBeenCalled();
  });
});
