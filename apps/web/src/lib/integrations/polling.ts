type PollableIntegration = {
  activityHistory: { status: string };
  plannedWorkouts: { status: string };
  setupData: { status: string };
};

export function getIntegrationPollingInterval(
  overview: readonly PollableIntegration[] | undefined,
): 5000 | false {
  const hasTransition = overview?.some(
    (integration) =>
      integration.activityHistory.status === "queued" ||
      integration.activityHistory.status === "importing" ||
      integration.plannedWorkouts.status === "queued" ||
      integration.plannedWorkouts.status === "syncing" ||
      integration.setupData.status === "refreshing",
  );
  return hasTransition ? 5000 : false;
}
