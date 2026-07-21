import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
}));

import { validateActivityHistorySearch } from "../routes/_protected/activities";

describe("activity history search contract", () => {
  it("keeps supported filters and strips invalid URL state", () => {
    expect(
      validateActivityHistorySearch({
        q: "  morning run  ",
        category: "run",
        sort: "distance",
        order: "asc",
        from: "2026-01-01",
        to: "2026-01-31",
        unsafe: "ignored",
      }),
    ).toEqual({
      q: "morning run",
      category: "run",
      sort: "distance",
      order: "asc",
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(
      validateActivityHistorySearch({
        category: "ski",
        sort: "newest",
        order: "sideways",
        from: "yesterday",
        to: "2026-1-1",
      }),
    ).toEqual({
      q: undefined,
      category: undefined,
      sort: undefined,
      order: undefined,
      from: undefined,
      to: undefined,
    });
  });
});
