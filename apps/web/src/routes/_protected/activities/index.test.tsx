import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
}));

import { validateActivityHistorySearch } from "./index";

describe("validateActivityHistorySearch", () => {
  it("drops activity-name search input while preserving non-name filters", () => {
    expect(
      validateActivityHistorySearch({
        q: "Private stored activity name",
        category: "run",
        sort: "date",
      }),
    ).toEqual({ category: "run", sort: "date" });
  });

  it("rejects impossible calendar dates instead of accepting regex-only values", () => {
    expect(validateActivityHistorySearch({ from: "2026-02-30", to: "2026-13-01" })).toEqual({});
    expect(validateActivityHistorySearch({ from: "2026-02-28", to: "2026-03-01" })).toEqual({
      from: "2026-02-28",
      to: "2026-03-01",
    });
  });
});
