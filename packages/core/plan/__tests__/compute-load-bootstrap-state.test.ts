import { describe, expect, it } from "vitest";
import { computeLoadBootstrapState } from "../computeLoadBootstrapState";

describe("computeLoadBootstrapState", () => {
  it("builds daily zero-filled history and returns deterministic state", () => {
    const bootstrap = computeLoadBootstrapState({
      as_of: "2026-02-16T00:00:00.000Z",
      window_days: 14,
      activities: [
        { occurred_at: "2026-02-03T12:00:00.000Z", load: 65 },
        { occurred_at: "2026-02-08T08:00:00.000Z", load: 72 },
        { occurred_at: "2026-02-08T18:00:00.000Z", load: 28 },
        { occurred_at: "2026-02-13T10:30:00.000Z", load: 80 },
      ],
    });

    expect(bootstrap.starting_longTermLoad).toBeGreaterThan(0);
    expect(bootstrap.starting_recentLoad).toBeGreaterThan(0);
    expect(bootstrap.confidence.window_days).toBe(14);
    expect(bootstrap.confidence.active_days).toBe(3);
    expect(bootstrap.confidence.zero_fill_days).toBe(11);
    expect(bootstrap.confidence.rationale_codes).toContain("daily_zero_fill_bootstrap");
  });

  it("returns bounded fallback state for no recent activity", () => {
    const bootstrap = computeLoadBootstrapState({
      as_of: "2026-02-16T00:00:00.000Z",
      window_days: 21,
      activities: [],
    });

    expect(bootstrap.starting_longTermLoad).toBe(18);
    expect(bootstrap.starting_recentLoad).toBe(18);
    expect(bootstrap.starting_loadBalance).toBe(0);
    expect(bootstrap.confidence.confidence).toBe(0);
    expect(bootstrap.confidence.history_state).toBe("none");
    expect(bootstrap.confidence.rationale_codes).toContain("age_unknown_conservative_prior");
  });

  it("applies a stricter no-history prior for youth athletes", () => {
    const bootstrap = computeLoadBootstrapState({
      as_of: "2026-02-16T00:00:00.000Z",
      window_days: 21,
      activities: [],
      profile_age: 15,
    });

    expect(bootstrap.starting_longTermLoad).toBeLessThan(18);
    expect(bootstrap.starting_recentLoad).toBe(bootstrap.starting_longTermLoad);
    expect(bootstrap.confidence.rationale_codes).toContain("youth_safe_prior_applied");
  });

  it("decays stale load and confidence when activity is old", () => {
    const fresh = computeLoadBootstrapState({
      as_of: "2026-02-16T00:00:00.000Z",
      window_days: 90,
      activities: [
        { occurred_at: "2026-02-14T12:00:00.000Z", load: 90 },
        { occurred_at: "2026-02-12T12:00:00.000Z", load: 70 },
      ],
    });

    const stale = computeLoadBootstrapState({
      as_of: "2026-02-16T00:00:00.000Z",
      window_days: 90,
      activities: [
        { occurred_at: "2025-12-01T12:00:00.000Z", load: 90 },
        { occurred_at: "2025-12-03T12:00:00.000Z", load: 70 },
      ],
    });

    expect(stale.starting_longTermLoad).toBeLessThan(fresh.starting_longTermLoad);
    expect(stale.starting_recentLoad).toBeLessThan(fresh.starting_recentLoad);
    expect(stale.confidence.confidence).toBeLessThan(fresh.confidence.confidence);
    expect(stale.confidence.rationale_codes).toContain("stale_history_decay_applied");
  });
});
