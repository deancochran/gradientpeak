import type { CreationBehaviorControlsV1 } from "@repo/core";

export const hasBehaviorControlsChanged = (
  previous: CreationBehaviorControlsV1,
  next: CreationBehaviorControlsV1,
): boolean => JSON.stringify(previous) !== JSON.stringify(next);

export const shouldApplyBehaviorControlSuggestions = (params: {
  mode: "seed" | "recompute";
  locked: boolean;
  dirty: boolean;
}): boolean => params.mode === "seed" || (!params.locked && !params.dirty);
