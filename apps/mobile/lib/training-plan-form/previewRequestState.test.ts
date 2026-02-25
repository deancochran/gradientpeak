import { describe, expect, it } from "vitest";
import {
  nextPendingPreviewCount,
  shouldIgnorePreviewResponse,
} from "./previewRequestState";

describe("preview request race handling", () => {
  it("ignores cancelled and stale responses under rapid drags", () => {
    expect(
      shouldIgnorePreviewResponse({
        requestId: 3,
        latestAppliedRequestId: 4,
        cancelled: false,
      }),
    ).toBe(true);

    expect(
      shouldIgnorePreviewResponse({
        requestId: 5,
        latestAppliedRequestId: 4,
        cancelled: true,
      }),
    ).toBe(true);

    expect(
      shouldIgnorePreviewResponse({
        requestId: 5,
        latestAppliedRequestId: 4,
        cancelled: false,
      }),
    ).toBe(false);
  });

  it("keeps pending loading count bounded while requests churn", () => {
    let pendingCount = 0;
    pendingCount = nextPendingPreviewCount({ pendingCount, delta: 1 });
    pendingCount = nextPendingPreviewCount({ pendingCount, delta: 1 });
    pendingCount = nextPendingPreviewCount({ pendingCount, delta: -1 });
    pendingCount = nextPendingPreviewCount({ pendingCount, delta: -1 });
    pendingCount = nextPendingPreviewCount({ pendingCount, delta: -1 });

    expect(pendingCount).toBe(0);
  });
});
