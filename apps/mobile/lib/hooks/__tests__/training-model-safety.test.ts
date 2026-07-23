import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/core/plan", () => ({
  extendTimeline: vi.fn(),
  reduceIntensity: vi.fn(),
}));

import { deriveSmartSuggestion } from "../useSmartSuggestions";

describe("training model safety", () => {
  it("offers review without automatically mutating the plan", () => {
    const suggestion = deriveSmartSuggestion({
      plan: {
        structure: {
          min_rest_days_per_week: 1,
          target_activities_per_week: 4,
          target_weekly_tss_max: 500,
          target_weekly_tss_min: 300,
        },
        created_at: "2026-01-01",
      },
      status: { longTermLoad: 45, loadBalance: -35 },
    });
    const copy = `${suggestion?.title} ${suggestion?.description}`.toLowerCase();

    expect(suggestion).toMatchObject({ reason: "load_balance_review", severity: "info" });
    expect(suggestion?.adjustedStructure).toBeUndefined();
    expect(copy).not.toMatch(/detected|fatigue|rest day|dangerous|physiolog/);
  });
});
