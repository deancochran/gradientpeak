import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("../useProfileGoals", () => ({ useProfileGoals: vi.fn() }));
vi.mock("../useProfileSettings", () => ({ useProfileSettings: vi.fn() }));
vi.mock("@repo/core/plan", () => ({
  extendTimeline: vi.fn(),
  reduceIntensity: vi.fn(),
}));

import { deriveLoadBalanceContext } from "../useHomeData";
import { deriveSmartSuggestion } from "../useSmartSuggestions";

describe("training model safety", () => {
  it("keeps missing load context unknown instead of converting it to a score", () => {
    expect(deriveLoadBalanceContext(null)).toMatchObject({
      status: "unknown",
      label: "Unknown",
      ctl: null,
      atl: null,
      tsb: null,
    });
  });

  it("describes load balance without physiological readiness claims", () => {
    const context = deriveLoadBalanceContext({ ctl: 45, atl: 80, tsb: -35 });
    const copy = `${context.label} ${context.description}`.toLowerCase();

    expect(context.status).toBe("more_recent_load");
    expect(copy).not.toMatch(/ready|fatigue|rest|physiolog/);
  });

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
      status: { ctl: 45, tsb: -35 },
    });
    const copy = `${suggestion?.title} ${suggestion?.description}`.toLowerCase();

    expect(suggestion).toMatchObject({ reason: "load_balance_review", severity: "info" });
    expect(suggestion?.adjustedStructure).toBeUndefined();
    expect(copy).not.toMatch(/detected|fatigue|rest day|dangerous|physiolog/);
  });
});
