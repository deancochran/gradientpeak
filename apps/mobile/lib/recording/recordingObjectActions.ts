import type {
  RecordingActivityCategory,
  RecordingPlannedSessionLaunch,
  RecordingServiceActivityPlan,
} from "@repo/core";
import { Alert } from "react-native";
import type { ActivityRecorderService, RecordingLifecycle } from "@/lib/services/ActivityRecorder";
import {
  getMobileRecordingPlanSupport,
  type MobileRecordingPlanSupport,
} from "@/lib/services/ActivityRecorder/planSupport";
import {
  activitySelectionStore,
  type RecordingLaunchPayload,
} from "@/lib/stores/activitySelectionStore";
import { buildPlannedSessionRecordingLaunchPayload } from "./plannedSessionLaunch";

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
  activity_category?: string | null;
  plan?: RecordingServiceActivityPlan & { id?: string | null };
  eventId?: string;
  plannedSession?: RecordingPlannedSessionLaunch;
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
  return Boolean(
    currentPlan?.id &&
      candidate.plan?.id &&
      currentPlan.id === candidate.plan.id &&
      JSON.stringify(currentPlan.structure) === JSON.stringify(candidate.plan.structure),
  );
}

function getCategory(activity_category: string | null | undefined): RecordingActivityCategory {
  if (
    activity_category === "run" ||
    activity_category === "bike" ||
    activity_category === "swim" ||
    activity_category === "strength"
  ) {
    return activity_category;
  }
  return "other";
}

function getUnsupportedPlanResolution(
  support: Extract<MobileRecordingPlanSupport, { supported: false }>,
): RecordingObjectActionResolution {
  return {
    primaryAction: "disabled",
    secondaryActions: [],
    label: "Mobile Recording Unavailable",
    disabledReason: support.message,
    consequence: null,
    command: null,
    shouldNavigateToRecord: false,
    confirmationCopy: null,
  };
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

  if (candidate.objectKind === "activity_plan" && !isSamePlan(service, candidate)) {
    const support = getMobileRecordingPlanSupport(candidate.plan);
    if (!support.supported) {
      return getUnsupportedPlanResolution(support);
    }
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
        consequence: "Selecting this plan will keep route guidance unchanged.",
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
      const plan = candidate.plan;
      if (!plan) {
        const missingPlanSupport = getMobileRecordingPlanSupport(plan);
        if (!missingPlanSupport.supported) {
          const resolution = getUnsupportedPlanResolution(missingPlanSupport);
          Alert.alert(resolution.label, resolution.disabledReason ?? "Try a different plan.");
        }
        return;
      }
      const support = getMobileRecordingPlanSupport(plan);
      if (!support.supported) {
        const resolution = getUnsupportedPlanResolution(support);
        Alert.alert(resolution.label, resolution.disabledReason ?? "Try a different plan.");
        return;
      }
      const payload: RecordingLaunchPayload = candidate.plannedSession
        ? await buildPlannedSessionRecordingLaunchPayload({
            plannedSession: candidate.plannedSession,
            ...(candidate.eventId === undefined ? {} : { eventId: candidate.eventId }),
            name: candidate.label,
            description: plan.description,
          })
        : {
            launchSource: "activity_plan",
            activity_category: support.activity_category,
            gpsRecordingEnabled: false,
            plan,
          };
      activitySelectionStore.setSelection(payload);
      navigateToRecord();
      return;
    }

    if (command === "start_with_route") {
      const activity_category = getCategory(candidate.activity_category);
      const payload: RecordingLaunchPayload = {
        launchSource: "route",
        activity_category,
        gpsRecordingEnabled: false,
        routeId: candidate.objectId,
      };
      activitySelectionStore.setSelection(payload);
      navigateToRecord();
      return;
    }

    if (!service) return;

    if (command === "attach_plan") {
      const plan = candidate.plan;
      if (!plan) {
        const missingPlanSupport = getMobileRecordingPlanSupport(plan);
        if (!missingPlanSupport.supported) {
          const resolution = getUnsupportedPlanResolution(missingPlanSupport);
          Alert.alert(resolution.label, resolution.disabledReason ?? "Try a different plan.");
        }
        return;
      }
      const support = getMobileRecordingPlanSupport(plan);
      if (!support.supported) {
        const resolution = getUnsupportedPlanResolution(support);
        Alert.alert(resolution.label, resolution.disabledReason ?? "Try a different plan.");
        return;
      }
      if (candidate.plannedSession) {
        await buildPlannedSessionRecordingLaunchPayload({
          plannedSession: candidate.plannedSession,
          ...(candidate.eventId === undefined ? {} : { eventId: candidate.eventId }),
          name: candidate.label,
          description: plan.description,
        });
        service.selectPlan(plan, candidate.eventId, candidate.plannedSession);
      } else if (candidate.eventId !== undefined) {
        service.selectPlan(plan, candidate.eventId);
      } else {
        service.selectPlan(plan);
      }
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
