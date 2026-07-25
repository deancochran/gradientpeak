/**
 * GradientPeak product contracts layered on the standalone FTMS protocol package.
 *
 * Pure protocol constants, codecs, parser contracts, and control-state contracts
 * are owned by `@deancochran/ftms`. This module remains as a compatibility
 * boundary for existing Core consumers and product-specific coordinator types.
 */

import type {
  FTMSFeatures,
  FTMSResponse,
  FtmsAvailableMode,
  FtmsCharacteristicProperties,
  FtmsControlMode,
  FtmsControlState,
  FtmsControlSupportLevel,
  FtmsMachineType,
  FtmsMachineTypeSource,
} from "@deancochran/ftms";
import type { RecordingTrainerControlIntent } from "./schemas/recording-session";

export type {
  FTMSControlEvent,
  FTMSDeviceType,
  FTMSFeatures,
  FTMSResponse,
  FtmsAvailableMode,
  FtmsAvailableModeRange,
  FtmsCharacteristicKind,
  FtmsCharacteristicProperties,
  FtmsControlMode,
  FtmsControlState,
  FtmsControlSupportLevel,
  FtmsDiagnostic,
  FtmsMachineStatusParameter,
  FtmsMachineType,
  FtmsMachineTypeSource,
  FtmsParserDefinition,
  FtmsParserDiagnostics,
  FtmsRuntimeMetrics,
  FtmsSafetyLevel,
  FtmsStatusPayload,
  FtmsSupportedRange,
  ParsedFtmsIndoorBikeData,
  ParsedFtmsPayload,
} from "@deancochran/ftms";
export { ControlMode, ftmsControlModes } from "@deancochran/ftms";

export type RecordingTrainerCommandStatusCode =
  | "queued"
  | "applying"
  | "succeeded"
  | "unsupported"
  | "control_rejected"
  | "control_lost"
  | "timeout"
  | "write_failed"
  | "failed";

export interface RecordingTrainerCommandStatus {
  status: RecordingTrainerCommandStatusCode;
  intent?: RecordingTrainerControlIntent;
  deviceId?: string;
  requestedAt?: string;
  completedAt?: string;
  message?: string;
  response?: FTMSResponse;
}

export interface FtmsDeviceSnapshot {
  deviceId: string;
  displayName: string;
  machineType: FtmsMachineType;
  machineTypeSource: FtmsMachineTypeSource;
  supportLevel: Extract<FtmsControlSupportLevel, "metrics_only" | "control_capable">;
  features: FTMSFeatures;
  properties: Partial<Record<string, FtmsCharacteristicProperties>>;
}

export interface FtmsControlSnapshot {
  deviceId: string;
  controlState: FtmsControlState;
  selectedMode: FtmsControlMode;
  availableModes: FtmsAvailableMode[];
  lastCommandStatus: RecordingTrainerCommandStatus | null;
}

export interface FtmsSelectedControlTargetState {
  selectedDeviceId: string | null;
  candidates: FtmsDeviceSnapshot[];
  selectedControl: FtmsControlSnapshot | null;
  integratedControlEnabled: boolean;
  manualOverrideActive: boolean;
}

export interface FtmsControlCoordinator {
  getSnapshot(): FtmsSelectedControlTargetState;
  selectDevice(deviceId: string): Promise<void>;
  setIntegratedControlEnabled(enabled: boolean): void;
  sendIntent(deviceId: string, intent: RecordingTrainerControlIntent): Promise<boolean>;
}
