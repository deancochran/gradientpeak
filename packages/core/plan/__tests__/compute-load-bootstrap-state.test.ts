import { describe, expect, it } from "vitest";
import { computeLoadBootstrapState } from "../computeLoadBootstrapState";

describe("computeLoadBootstrapState", () => {
  it("builds daily zero-filled history and returns deterministic state", () => {
    const bootstrap = computeLoadBootstrapState({
      as_of: "2026-02-16T00:00:00.000Z",
      window_days: 14,
      activities: [
        { occurred_at: "2026-02-03T12:00:00.000Z", tss: 65 },
        { occurred_at: "2026-02-08T08:00:00.000Z", tss: 72 },
        { occurred_at: "2026-02-08T18:00:00.000Z", tss: 28 },
        { occurred_at: "2026-02-13T10:30:00.000Z", tss: 80 },
      ],
    });

    expect(bootstrap.starting_ctl).toBeGreaterThan(0);
    expect(bootstrap.starting_atl).toBeGreaterThan(0);
    expect(bootstrap.confidence.window_days).toBe(14);
    expect(bootstrap.confidence.active_days).toBe(3);
    expect(bootstrap.confidence.zero_fill_days).toBe(11);
    expect(bootstrap.confidence.rationale_codes).toContain(
      "daily_zero_fill_bootstrap",
    );
  });

  it("returns bounded fallback state for no recent activity", () => {
    const bootstrap = computeLoadBootstrapState({
      as_of: "2026-02-16T00:00:00.000Z",
      window_days: 21,
      activities: [],
    });

    expect(bootstrap.starting_ctl).toBe(0);
    expect(bootstrap.starting_atl).toBe(0);
    expect(bootstrap.starting_tsb).toBe(0);
    expect(bootstrap.confidence.confidence).toBe(0);
    expect(bootstrap.confidence.history_state).toBe("none");
  });

  it("decays stale load and confidence when activity is old", () => {
    const fresh = computeLoadBootstrapState({
      as_of: "2026-02-16T00:00:00.000Z",
      window_days: 90,
      activities: [
        { occurred_at: "2026-02-14T12:00:00.000Z", tss: 90 },
        { occurred_at: "2026-02-12T12:00:00.000Z", tss: 70 },
      ],
    });

    const stale = computeLoadBootstrapState({
      as_of: "2026-02-16T00:00:00.000Z",
      window_days: 90,
      activities: [
        { occurred_at: "2025-12-01T12:00:00.000Z", tss: 90 },
        { occurred_at: "2025-12-03T12:00:00.000Z", tss: 70 },
      ],
    });

    expect(stale.starting_ctl).toBeLessThan(fresh.starting_ctl);
    expect(stale.starting_atl).toBeLessThan(fresh.starting_atl);
    expect(stale.confidence.confidence).toBeLessThan(
      fresh.confidence.confidence,
    );
    expect(stale.confidence.rationale_codes).toContain(
      "stale_history_decay_applied",
    );
  });
});
