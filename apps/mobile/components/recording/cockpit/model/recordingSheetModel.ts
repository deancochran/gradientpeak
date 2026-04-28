import type { RecordingQuickAction, RecordingSessionContract, RecordingState } from "@repo/core";
import { buildRecordingActionModels, type RecordingActionModel } from "./recordingActionModel";

export const RECORDING_SHEET_EXPANDED_CONTENT_GAP = 44;
export const RECORDING_SHEET_HANDLE_HEIGHT = 12;
export const RECORDING_SHEET_CONTROL_TOP_INSET = 12;

type RecordingSheetTone = "active" | "idle" | "locked" | "warning";

export interface RecordingSheetSetupSection {
  id: "session" | "guidance" | "devices";
  title: string;
  items: RecordingSheetSetupItem[];
}

export interface RecordingSheetSetupItem extends RecordingActionModel {
  detail: string;
  section: RecordingSheetSetupSection["id"];
  title: string;
  tone: RecordingSheetTone;
}

export interface RecordingControlSheetModel {
  actions: RecordingActionModel[];
  collapsedHeight: number;
  sections: RecordingSheetSetupSection[];
  snapPoints: number[];
}

export function getRecordingControlSheetCollapsedHeight(params: {
  insetsBottom: number;
  recordingState: RecordingState;
}): number {
  const controlHeight = params.recordingState === "not_started" ? 56 : 48;

  return (
    controlHeight +
    RECORDING_SHEET_HANDLE_HEIGHT +
    RECORDING_SHEET_CONTROL_TOP_INSET +
    Math.max(0, params.insetsBottom)
  );
}

export function buildRecordingControlSheetModel(params: {
  insetsBottom: number;
  recordingState: RecordingState;
  sensorCount: number;
  sessionContract: RecordingSessionContract | null;
  actionHandlers: Parameters<typeof buildRecordingActionModels>[1];
}): RecordingControlSheetModel {
  const collapsedHeight = getRecordingControlSheetCollapsedHeight({
    insetsBottom: params.insetsBottom,
    recordingState: params.recordingState,
  });
  const actions: RecordingQuickAction[] = params.sessionContract?.ui.controls.quickActions ?? [
    "gps",
    "sensors",
    "plan",
    "route",
  ];
  const actionModels = buildRecordingActionModels(actions, params.actionHandlers);
  const setupItems = actionModels
    .filter((action) => action.id !== "activity")
    .map((action) => buildSetupItem(action, params.sessionContract, params.sensorCount));
  const sections = buildSetupSections(setupItems);

  return {
    actions: actionModels,
    collapsedHeight,
    sections,
    snapPoints: [collapsedHeight],
  };
}

function buildSetupItem(
  action: RecordingActionModel,
  contract: RecordingSessionContract | null,
  sensorCount: number,
): RecordingSheetSetupItem {
  switch (action.id) {
    case "activity":
      return {
        ...action,
        detail: action.disabled
          ? "Locked after session identity is set."
          : "Choose the sport type.",
        section: "session",
        title: "Activity",
        tone: action.disabled ? "locked" : "idle",
      };
    case "gps":
      return {
        ...action,
        detail: getGpsDetail(contract),
        section: "session",
        title: "GPS",
        tone: action.disabled
          ? "locked"
          : contract?.guidance.routeMode === "live_navigation"
            ? "active"
            : "idle",
      };
    case "plan":
      return {
        ...action,
        detail: contract?.guidance.hasPlan
          ? "Workout structure attached."
          : "No structured workout.",
        section: "guidance",
        title: "Workout",
        tone: action.disabled ? "locked" : contract?.guidance.hasPlan ? "active" : "idle",
      };
    case "route":
      return {
        ...action,
        detail: getRouteDetail(contract),
        section: "guidance",
        title: "Route",
        tone: action.disabled ? "locked" : contract?.guidance.hasRoute ? "active" : "idle",
      };
    case "trainer":
      return {
        ...action,
        detail: getTrainerDetail(contract),
        section: "devices",
        title: "Trainer",
        tone: contract?.devices.trainerControllable ? "active" : "warning",
      };
    case "sensors":
    default:
      return {
        ...action,
        detail: getSensorsDetail(contract, sensorCount),
        section: "devices",
        title: "Sensors",
        tone: sensorCount > 0 ? "active" : "idle",
      };
  }
}

function buildSetupSections(items: RecordingSheetSetupItem[]): RecordingSheetSetupSection[] {
  const sections: RecordingSheetSetupSection[] = [
    { id: "session", title: "Session", items: [] },
    { id: "guidance", title: "Guidance", items: [] },
    { id: "devices", title: "Devices", items: [] },
  ];

  for (const item of items) {
    sections.find((section) => section.id === item.section)?.items.push(item);
  }

  return sections.filter((section) => section.items.length > 0);
}

function getTrainerDetail(contract: RecordingSessionContract | null): string {
  if (contract?.degraded.trainer === "command_failed") {
    return "Last trainer command failed; recovery may be needed.";
  }

  if (contract?.degraded.trainer === "recovering") {
    return "Trainer control is recovering.";
  }

  if (contract?.degraded.trainer === "recovery_failed") {
    return "Trainer recovery failed; reconnect from sensors.";
  }

  if (contract?.degraded.trainer === "control_not_ready") {
    return "Trainer data is connected, but control is not ready.";
  }

  return contract?.devices.trainerControllable
    ? "Controllable trainer ready."
    : "Connect a controllable trainer.";
}

function getSensorsDetail(contract: RecordingSessionContract | null, sensorCount: number): string {
  if (contract?.degraded.sensors) {
    return `Source recovery needed: ${contract.degraded.sensors.replace(/_/g, " ")}.`;
  }

  return sensorCount > 0
    ? `${sensorCount} connected source${sensorCount === 1 ? "" : "s"}.`
    : "No sensors connected.";
}

function getGpsDetail(contract: RecordingSessionContract | null): string {
  if (!contract) {
    return "Choose location capture.";
  }

  if (contract.guidance.routeMode === "live_navigation") {
    return "Recording location for live route guidance.";
  }

  if (contract.guidance.routeMode === "virtual") {
    return "GPS off; route guidance stays virtual.";
  }

  if (contract.ui.backdropMode === "gps_unavailable" || contract.degraded.gps) {
    return "GPS requested but currently unavailable.";
  }

  return contract.devices.gpsAvailable ? "GPS source available." : "GPS source not active.";
}

function getRouteDetail(contract: RecordingSessionContract | null): string {
  if (!contract?.guidance.hasRoute) {
    return "No route attached.";
  }

  if (contract.guidance.routeMode === "live_navigation") {
    return "Route paired with live GPS navigation.";
  }

  if (contract.guidance.routeMode === "virtual") {
    return "Route guidance without GPS capture.";
  }

  if (contract.guidance.routeMode === "unavailable") {
    return "Route attached, but map geometry is unavailable.";
  }

  return "Route preview attached.";
}
