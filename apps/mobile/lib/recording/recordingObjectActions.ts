import type { RecordingActivityCategory, RecordingServiceActivityPlan } from "@repo/core";
import { Alert } from "react-native";
import type { ActivityRecorderService, RecordingLifecycle } from "@/lib/services/ActivityRecorder";
import {
  activitySelectionStore,
  type RecordingLaunchPayload,
} from "@/lib/stores/activitySelectionStore";

export type RecordingObjectKind = "activity_plan" | "route";
export type RecordingObjectAction =
  | "start"
  | "attach"
  | "detach"
  | "return"
  | "selected"
  | "disabled";
export type RecordingObjectCommand =
  | "start_with_plan"
  | "start_with_route"
  | "attach_plan"
  | "detach_plan"
  | "attach_route"
  | "detach_route"
  | "return_to_recording";

export interface RecordingObjectActionCandidate {
  objectKind: RecordingObjectKind;
  objectId: string;
  label?: string | null;
  category?: string | null;
  plan?: RecordingServiceActivityPlan & { id?: string | null };
  planRouteId?: string | null;
  canReadGeometry?: boolean;
}

export interface RecordingObjectActionResolution {
  primaryAction: RecordingObjectAction;
  secondaryActions: RecordingObjectAction[];
  label: string;
  disabledReason: string | null;
  consequence: string | null;
  command: RecordingObjectCommand | null;
  shouldNavigateToRecord: boolean;
  confirmationCopy: string | null;
}

function isSamePlan(
  service: ActivityRecorderService | null,
  candidate: RecordingObjectActionCandidate,
) {
  const currentPlan = service?.plan as
    | (RecordingServiceActivityPlan & { id?: string | null })
    | undefined;
  return Boolean(currentPlan?.id && candidate.plan?.id && currentPlan.id === candidate.plan.id);
}

function getCategory(category: string | null | undefined): RecordingActivityCategory {
  if (category === "run" || category === "bike" || category === "swim" || category === "strength") {
    return category;
  }
  return "other";
}

export function resolveRecordingObjectAction({
  candidate,
  lifecycle,
  service,
}: {
  candidate: RecordingObjectActionCandidate;
  lifecycle: RecordingLifecycle;
  service: ActivityRecorderService | null;
}): RecordingObjectActionResolution {
  if (candidate.objectKind === "route" && candidate.canReadGeometry === false) {
    return {
      primaryAction: "disabled",
      secondaryActions: [],
      label: "Route unavailable",
      disabledReason: "Route geometry is not available for recording.",
      consequence: null,
      command: null,
      shouldNavigateToRecord: false,
      confirmationCopy: null,
    };
  }

  if (lifecycle === "active") {
    if (candidate.objectKind === "activity_plan") {
      const selected = isSamePlan(service, candidate);
      return {
        primaryAction: selected ? "selected" : "attach",
        secondaryActions: selected ? ["return"] : ["return"],
        label: selected ? "Already in Active Recording" : "Update Active Recording",
        disabledReason: null,
        consequence: "Updates the active recording session.",
        command: selected ? null : "attach_plan",
        shouldNavigateToRecord: false,
        confirmationCopy: selected ? null : "Active recording updated.",
      };
    }

    const selected = service?.attachedRouteId === candidate.objectId;
    return {
      primaryAction: selected ? "selected" : "attach",
      secondaryActions: selected ? ["detach", "return"] : ["return"],
      label: selected ? "Already in Active Recording" : "Update Active Recording",
      disabledReason: null,
      consequence: "Updates route guidance for this recording only.",
      command: selected ? null : "attach_route",
      shouldNavigateToRecord: false,
      confirmationCopy: selected ? null : "Route guidance updated for the active recording.",
    };
  }

  if (lifecycle === "setup") {
    if (candidate.objectKind === "activity_plan") {
      const selected = isSamePlan(service, candidate);
      return {
        primaryAction: selected ? "selected" : "attach",
        secondaryActions: selected ? ["detach"] : [],
        label: selected ? "Selected for Recording" : service?.plan ? "Replace Plan" : "Use Plan",
        disabledReason: null,
        consequence: candidate.planRouteId
          ? "Selecting this plan will replace the current route with the plan route."
          : "Selecting this plan will remove the current route unless you choose another route.",
        command: selected ? null : "attach_plan",
        shouldNavigateToRecord: false,
        confirmationCopy: selected ? null : "Plan selected for recording.",
      };
    }

    const selected = service?.attachedRouteId === candidate.objectId;
    return {
      primaryAction: selected ? "selected" : "attach",
      secondaryActions: selected ? ["detach"] : [],
      label: selected
        ? "Selected for Recording"
        : service?.attachedRouteId
          ? "Replace Route"
          : "Use Route",
      disabledReason: null,
      consequence: service?.plan ? "Selected route overrides the plan route." : null,
      command: selected ? null : "attach_route",
      shouldNavigateToRecord: false,
      confirmationCopy: selected ? null : "Route selected for recording.",
    };
  }

  return {
    primaryAction: "start",
    secondaryActions: [],
    label: "Start Activity",
    disabledReason: null,
    consequence: null,
    command: candidate.objectKind === "activity_plan" ? "start_with_plan" : "start_with_route",
    shouldNavigateToRecord: true,
    confirmationCopy: null,
  };
}

export async function handleRecordingObjectAction({
  candidate,
  command,
  navigateToRecord,
  service,
}: {
  candidate: RecordingObjectActionCandidate;
  command: RecordingObjectCommand | null;
  navigateToRecord: () => void;
  service: ActivityRecorderService | null;
}) {
  if (!command) return;

  try {
    if (command === "return_to_recording") {
      navigateToRecord();
      return;
    }

    if (command === "start_with_plan") {
      if (!candidate.plan) return;
      const payload: RecordingLaunchPayload = {
        launchSource: "activity_plan",
        category: candidate.plan.activity_category,
        gpsRecordingEnabled: true,
        plan: candidate.plan,
        routeId: candidate.plan.route_id ?? null,
      };
      activitySelectionStore.setSelection(payload);
      navigateToRecord();
      return;
    }

    if (command === "start_with_route") {
      const category = getCategory(candidate.category);
      const payload: RecordingLaunchPayload = {
        launchSource: "route",
        category,
        gpsRecordingEnabled: category === "run" || category === "bike",
        routeId: candidate.objectId,
      };
      activitySelectionStore.setSelection(payload);
      navigateToRecord();
      return;
    }

    if (!service) return;

    if (command === "attach_plan") {
      if (!candidate.plan) return;
      service.selectPlan(candidate.plan);
      navigateToRecord();
      return;
    }

    if (command === "detach_plan") {
      service.clearPlan();
      return;
    }

    if (command === "attach_route") {
      await service.attachRoute(candidate.objectId);
      navigateToRecord();
      return;
    }

    if (command === "detach_route") {
      service.detachRoute();
    }
  } catch (error) {
    Alert.alert("Recording Update Failed", error instanceof Error ? error.message : "Try again.");
  }
}
