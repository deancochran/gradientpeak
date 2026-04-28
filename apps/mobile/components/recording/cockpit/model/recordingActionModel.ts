import type { RecordingQuickAction, RecordingSessionContract } from "@repo/core";

export interface RecordingActionModel {
  disabled: boolean;
  hint: string;
  id: RecordingQuickAction;
  label: string;
  onPress: () => void;
}

export function buildRecordingActionModels(
  actions: RecordingQuickAction[],
  context: {
    onGpsPress: () => void;
    onOpenActivity: () => void;
    onOpenFtms: () => void;
    onOpenPlan: () => void;
    onOpenRoute: () => void;
    onOpenSensors: () => void;
    sessionContract: RecordingSessionContract | null;
  },
): RecordingActionModel[] {
  return actions.map((action) => resolveRecordingAction(action, context));
}

function resolveRecordingAction(
  action: RecordingQuickAction,
  context: Parameters<typeof buildRecordingActionModels>[1],
): RecordingActionModel {
  const contract = context.sessionContract;

  switch (action) {
    case "activity": {
      const disabled = contract ? !contract.editing.canEditActivity : false;
      return {
        disabled,
        hint: disabled ? "The current session activity is locked." : "Adjust the session activity.",
        id: action,
        label: disabled ? "Activity locked" : "Activity",
        onPress: context.onOpenActivity,
      };
    }
    case "gps": {
      const disabled = contract ? !contract.editing.canEditGps : false;
      return {
        disabled,
        hint: disabled ? "GPS mode is locked after recording starts." : "Adjust GPS capture.",
        id: action,
        label: disabled
          ? "GPS locked"
          : contract?.guidance.routeMode === "live_navigation"
            ? "GPS on"
            : "GPS",
        onPress: context.onGpsPress,
      };
    }
    case "plan": {
      const disabled = contract ? !contract.editing.canEditPlan : false;
      return {
        disabled,
        hint: disabled
          ? "Plan changes are locked after recording starts."
          : "Open workout plan adjustments.",
        id: action,
        label: disabled ? "Plan locked" : contract?.guidance.hasPlan ? "Plan attached" : "Plan",
        onPress: context.onOpenPlan,
      };
    }
    case "route": {
      const disabled = contract ? !contract.editing.canEditRoute : false;
      return {
        disabled,
        hint: disabled
          ? "Route changes are locked after recording starts."
          : "Open route adjustments.",
        id: action,
        label: disabled ? "Route locked" : contract?.guidance.hasRoute ? "Route attached" : "Route",
        onPress: context.onOpenRoute,
      };
    }
    case "trainer":
      return {
        disabled: false,
        hint: contract?.devices.trainerControllable
          ? "Open trainer controls."
          : "Open sensors to connect a controllable trainer.",
        id: action,
        label: contract?.devices.trainerControllable ? "Trainer ready" : "Connect trainer",
        onPress: contract?.devices.trainerControllable ? context.onOpenFtms : context.onOpenSensors,
      };
    case "sensors":
    default:
      return {
        disabled: false,
        hint: "Open connected sensors and source readiness.",
        id: action,
        label: "Sensors",
        onPress: context.onOpenSensors,
      };
  }
}
