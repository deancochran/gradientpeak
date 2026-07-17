import type { FTMSFeatures, FtmsControlMode, FtmsMachineType } from "../ftms-types";
import type { MetricFamily, MetricSourceType } from "../schemas/recording-session";

export type RecorderHardwareTransport =
  | "native_mobile"
  | "desktop_bridge"
  | "web_bluetooth"
  | "file_import"
  | "manual";

export type RecorderAdapterAvailability = "available" | "unavailable" | "requires_setup";

export interface RecordingMetricCapability {
  metricFamily: MetricFamily;
  sourceTypes: MetricSourceType[];
}

export interface FtmsMeasurementCapability {
  machineType: FtmsMachineType | "unknown";
  metrics: RecordingMetricCapability[];
}

export interface FtmsControlCapability {
  canRequestControl: boolean;
  supportedModes: FtmsControlMode[];
}

export interface BleFtmsAdapterCapabilities {
  bleScanning: boolean;
  ftmsMeasurement: FtmsMeasurementCapability | null;
  ftmsControl: FtmsControlCapability | null;
}

export interface RecorderAdapterCapabilityContract {
  adapterId: string;
  label: string;
  transport: RecorderHardwareTransport;
  availability: RecorderAdapterAvailability;
  liveRecording: boolean;
  durableLocalQueue: boolean;
  backgroundSafe: boolean;
  gpsTracking: boolean;
  bleFtms: BleFtmsAdapterCapabilities;
  notes: string[];
}

function createEmptyBleFtmsCapabilities(): BleFtmsAdapterCapabilities {
  return { bleScanning: false, ftmsMeasurement: null, ftmsControl: null };
}

export function createManualRecorderAdapterContract(
  overrides: Partial<RecorderAdapterCapabilityContract> = {},
): RecorderAdapterCapabilityContract {
  return {
    adapterId: "manual",
    label: "Manual recorder",
    transport: "manual",
    availability: "available",
    liveRecording: true,
    durableLocalQueue: false,
    backgroundSafe: false,
    gpsTracking: false,
    bleFtms: createEmptyBleFtmsCapabilities(),
    notes: [],
    ...overrides,
  };
}

export function createFileImportRecorderAdapterContract(
  overrides: Partial<RecorderAdapterCapabilityContract> = {},
): RecorderAdapterCapabilityContract {
  return {
    adapterId: "file_import",
    label: "Completed file import",
    transport: "file_import",
    availability: "available",
    liveRecording: false,
    durableLocalQueue: true,
    backgroundSafe: true,
    gpsTracking: false,
    bleFtms: createEmptyBleFtmsCapabilities(),
    notes: ["Imports completed FIT, GPX, or TCX files instead of controlling live hardware."],
    ...overrides,
  };
}

export function deriveFtmsMeasurementCapability({
  features,
  machineType = "unknown",
}: {
  features: Partial<FTMSFeatures>;
  machineType?: FtmsMachineType | "unknown";
}): FtmsMeasurementCapability {
  const metrics: RecordingMetricCapability[] = [];
  if (features.heartRateMeasurementSupported)
    metrics.push({ metricFamily: "heart_rate", sourceTypes: ["trainer_passthrough"] });
  if (features.powerMeasurementSupported)
    metrics.push({ metricFamily: "power", sourceTypes: ["trainer_power"] });
  if (features.cadenceSupported || features.targetedCadenceSupported)
    metrics.push({ metricFamily: "cadence", sourceTypes: ["trainer_cadence"] });
  if (features.averageSpeedSupported || features.speedTargetSettingSupported)
    metrics.push({ metricFamily: "speed", sourceTypes: ["trainer_speed"] });
  if (features.totalDistanceSupported)
    metrics.push({ metricFamily: "distance", sourceTypes: ["trainer_speed"] });
  if (features.elevationGainSupported || features.inclinationSupported)
    metrics.push({ metricFamily: "elevation", sourceTypes: ["derived"] });
  return { machineType, metrics };
}

export function deriveFtmsControlCapability(
  features: Partial<FTMSFeatures>,
): FtmsControlCapability {
  const supportedModes: FtmsControlMode[] = [];
  if (features.powerTargetSettingSupported || features.supportsERG) supportedModes.push("erg");
  if (features.indoorBikeSimulationSupported || features.supportsSIM) supportedModes.push("grade");
  if (features.resistanceTargetSettingSupported || features.supportsResistance)
    supportedModes.push("resistance");
  if (features.speedTargetSettingSupported) supportedModes.push("speed");
  if (features.inclinationTargetSettingSupported) supportedModes.push("inclination");
  if (features.heartRateTargetSettingSupported) supportedModes.push("target_heart_rate");
  if (features.targetedCadenceSupported) supportedModes.push("target_cadence");
  return { canRequestControl: supportedModes.length > 0, supportedModes };
}
