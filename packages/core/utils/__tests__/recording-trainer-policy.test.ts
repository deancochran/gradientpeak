import { describe, expect, it } from "vitest";

import {
  canTrainerIntentPreempt,
  compareTrainerIntentPriority,
  recordingTrainerIntentPrecedence,
  selectWinningTrainerIntent,
} from "../recording-trainer-policy";

describe("recording trainer policy", () => {
  it("keeps the documented command precedence order", () => {
    expect(recordingTrainerIntentPrecedence).toEqual([
      "manual",
      "reconnect_recovery",
      "step_change",
      "periodic_refinement",
    ]);
  });

  it("prefers manual intents over lower-priority automatic intents", () => {
    const selected = selectWinningTrainerIntent({
      trainerMode: "auto",
      candidates: [
        {
          intent: { type: "set_power", source: "step_change", watts: 240 },
          createdAt: "2026-03-20T10:00:00Z",
        },
        {
          intent: { type: "set_power", source: "manual", watts: 260 },
          createdAt: "2026-03-20T10:00:01Z",
        },
      ],
    });

    expect(selected?.intent.source).toBe("manual");
    expect(selected?.intent.type).toBe("set_power");
  });

  it("blocks non-manual intents while trainer mode is manual", () => {
    const selected = selectWinningTrainerIntent({
      trainerMode: "manual",
      candidates: [
        {
          intent: { type: "set_power", source: "reconnect_recovery", watts: 245 },
        },
      ],
    });

    expect(selected).toBeNull();
  });

  it("breaks same-priority ties by newest timestamp", () => {
    const comparison = compareTrainerIntentPriority(
      {
        intent: { type: "set_power", source: "step_change", watts: 220 },
        createdAt: "2026-03-20T10:00:00Z",
      },
      {
        intent: { type: "set_power", source: "step_change", watts: 230 },
        createdAt: "2026-03-20T10:00:02Z",
      },
    );

    expect(comparison).toBeGreaterThan(0);
  });

  it("allows higher or equal priority intents to preempt lower ones", () => {
    expect(canTrainerIntentPreempt("manual", "periodic_refinement")).toBe(true);
    expect(canTrainerIntentPreempt("step_change", "reconnect_recovery")).toBe(false);
  });
});
