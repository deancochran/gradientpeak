type PollableIntegration = {
  activityHistory: { status: string };
  plannedActivities: { status: string };
  providerHealth: { status: string };
  setupData: { status: string };
};

export function getIntegrationPollingInterval(
  overview: readonly PollableIntegration[] | undefined,
): 5000 | false {
  const hasTransition = overview?.some(
    (integration) =>
      integration.providerHealth.status === "disconnecting" ||
      integration.activityHistory.status === "queued" ||
      integration.activityHistory.status === "importing" ||
      integration.plannedActivities.status === "queued" ||
      integration.plannedActivities.status === "syncing" ||
      integration.setupData.status === "refreshing",
  );
  return hasTransition ? 5000 : false;
}
