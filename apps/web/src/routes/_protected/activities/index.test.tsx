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
});
