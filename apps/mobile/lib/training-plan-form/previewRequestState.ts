export function shouldIgnorePreviewResponse(input: {
  requestId: number;
  latestAppliedRequestId: number;
  cancelled: boolean;
}): boolean {
  return input.cancelled || input.requestId < input.latestAppliedRequestId;
}

export function nextPendingPreviewCount(input: {
  pendingCount: number;
  delta: 1 | -1;
}): number {
  return Math.max(0, input.pendingCount + input.delta);
}
