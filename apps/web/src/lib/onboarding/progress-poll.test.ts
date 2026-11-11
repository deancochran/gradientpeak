import { describe, expect, it, vi } from "vitest";
import { pollOnboardingProgress } from "./progress-poll";

const importing = {
  status: "processing" as const,
  phase: "importing_activities" as const,
  percent: 50 as const,
  message: "Importing your activity history.",
  detail: "4 activities imported so far.",
  provider_summary: [{ provider: "wahoo" as const, label: "Wahoo", state: "working" as const }],
  recovery: null,
};

describe("pollOnboardingProgress", () => {
  it("uses only the focused progress read while processing", async () => {
    const loadProgress = vi.fn(async () => ({ progress: importing, error: null }));
    const loadReview = vi.fn();
    await expect(
      pollOnboardingProgress({ loadProgress, loadReview, shouldLoadReview: true }),
    ).resolves.toEqual({ kind: "progress", progress: importing });
    expect(loadProgress).toHaveBeenCalledOnce();
    expect(loadReview).not.toHaveBeenCalled();
  });

  it("hydrates persisted review exactly once without a reconciliation write", async () => {
    const review = {
      ...importing,
      status: "review" as const,
      phase: "ready" as const,
      percent: 100 as const,
    };
    const loadProgress = vi.fn(async () => ({ progress: review, error: null }));
    const loadReview = vi.fn(async () => ({ profile: "review" }));
    const result = await pollOnboardingProgress({
      loadProgress,
      loadReview,
      shouldLoadReview: true,
    });
    expect(result.kind).toBe("review");
    expect(loadProgress).toHaveBeenCalledOnce();
    expect(loadReview).toHaveBeenCalledOnce();
  });

  it("reports a transient failure without replacing the caller's last snapshot", async () => {
    const result = await pollOnboardingProgress({
      loadProgress: async () => ({ progress: null, error: "Temporary progress failure" }),
      loadReview: vi.fn(),
      shouldLoadReview: true,
    });
    expect(result).toEqual({ kind: "error", message: "Temporary progress failure" });
    expect(importing.percent).toBe(50);
  });
});
