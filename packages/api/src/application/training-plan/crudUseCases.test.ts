import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it, vi } from "vitest";
import { createQueryMapDbMock } from "../../test/mock-query-db";
import { listTrainingPlansUseCase } from "./crudUseCases";

describe("listTrainingPlansUseCase", () => {
  it("forwards index cursor paging and filters to the repository page contract", async () => {
    const page = vi.fn().mockResolvedValue({ items: [], total: 31 });
    const { db } = createQueryMapDbMock({
      likes: { data: [], error: null },
      profiles: { data: [], error: null },
    });

    const result = await listTrainingPlansUseCase({
      db: db as unknown as DrizzleDbClient,
      profileId: "00000000-0000-4000-8000-000000000001",
      query: {
        ownerScope: "own",
        visibility: "private",
        search: "Base plan",
        cursor: "index:20",
        limit: 10,
      },
      repository: { listTrainingPlansPage: page } as never,
    });

    expect(page).toHaveBeenCalledWith({
      profileId: "00000000-0000-4000-8000-000000000001",
      ownerScope: "own",
      visibility: "private",
      search: "Base plan",
      offset: 20,
      limit: 10,
    });
    expect(result).toMatchObject({ total: 31, hasMore: true, nextCursor: "index:30", items: [] });
  });
});
