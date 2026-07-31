import type { CreationBehaviorControls } from "@repo/core";

export const hasBehaviorControlsChanged = (
  previous: CreationBehaviorControls,
  next: CreationBehaviorControls,
): boolean => JSON.stringify(previous) !== JSON.stringify(next);

export const shouldApplyBehaviorControlSuggestions = (params: {
  mode: "seed" | "recompute";
  locked: boolean;
  dirty: boolean;
}): boolean => params.mode === "seed" || (!params.locked && !params.dirty);
