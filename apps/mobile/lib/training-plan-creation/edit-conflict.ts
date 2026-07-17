export function resolveEditBuilderHydrationDecision(input: {
  currentPlanId: string;
  currentStructureHash: string | null;
  hydratedPlanId: string | null;
  hydratedStructureHash: string | null;
  requiresConflictReload: boolean;
}): "reload" | "skip" | "block_retry" {
  if (input.hydratedPlanId !== input.currentPlanId) {
    return "reload";
  }
  if (!input.requiresConflictReload) {
    return "skip";
  }
  return input.hydratedStructureHash === input.currentStructureHash ? "block_retry" : "reload";
}
