export type ProviderSyncResourceKind = "event" | "activity_plan" | "activity_route" | "activity";

export type ProviderSyncEligibility = {
  eligible: boolean;
  nextEligibleAt?: string;
  reason?: string;
  warnings?: string[];
};

export type ProviderPublishResult = {
  action: "created" | "updated" | "recreated" | "deleted" | "noop";
  error?: string;
  externalId?: string;
  success: boolean;
  warnings?: string[];
};

export interface PlannedWorkoutProviderAdapter {
  getPublishEligibility(input: {
    integrationId: string;
    profileId: string;
    resourceKind: ProviderSyncResourceKind;
    startsAt: string;
  }): Promise<ProviderSyncEligibility>;
  publishResource(input: {
    integrationId: string;
    profileId: string;
    resourceId: string;
    resourceKind: ProviderSyncResourceKind;
  }): Promise<ProviderPublishResult>;
  reconcileIntegration(input: { integrationId: string; profileId: string }): Promise<void>;
  unsyncResource(input: {
    integrationId: string;
    profileId: string;
    resourceId: string;
    resourceKind: ProviderSyncResourceKind;
  }): Promise<ProviderPublishResult>;
}
