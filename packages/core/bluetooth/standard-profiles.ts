import { BLE_CHARACTERISTIC_UUIDS, BLE_SERVICE_UUIDS } from "../constants/ble";

export type StandardBleProfileId =
  | "heart_rate"
  | "cycling_power"
  | "cycling_speed_and_cadence"
  | "running_speed_and_cadence";

export type StandardBleMetric = "heart_rate" | "power" | "cadence" | "speed";

export interface StandardBleMetricCapability {
  metric: StandardBleMetric;
  requirement: "required" | "optional";
}

export interface StandardBleProfileDefinition {
  id: StandardBleProfileId;
  name: string;
  serviceUuid: string;
  measurementCharacteristicUuid: string;
  metrics: readonly StandardBleMetricCapability[];
}

const STANDARD_BLE_PROFILE_DEFINITIONS: readonly StandardBleProfileDefinition[] = [
  {
    id: "heart_rate",
    name: "Heart Rate",
    serviceUuid: BLE_SERVICE_UUIDS.HEART_RATE,
    measurementCharacteristicUuid: BLE_CHARACTERISTIC_UUIDS.HEART_RATE_MEASUREMENT,
    metrics: [{ metric: "heart_rate", requirement: "required" }],
  },
  {
    id: "cycling_power",
    name: "Cycling Power",
    serviceUuid: BLE_SERVICE_UUIDS.CYCLING_POWER,
    measurementCharacteristicUuid: BLE_CHARACTERISTIC_UUIDS.CYCLING_POWER_MEASUREMENT,
    metrics: [
      { metric: "power", requirement: "required" },
      { metric: "cadence", requirement: "optional" },
    ],
  },
  {
    id: "cycling_speed_and_cadence",
    name: "Cycling Speed and Cadence",
    serviceUuid: BLE_SERVICE_UUIDS.CYCLING_SPEED_AND_CADENCE,
    measurementCharacteristicUuid: BLE_CHARACTERISTIC_UUIDS.CYCLING_SPEED_AND_CADENCE_MEASUREMENT,
    metrics: [
      { metric: "speed", requirement: "optional" },
      { metric: "cadence", requirement: "optional" },
    ],
  },
  {
    id: "running_speed_and_cadence",
    name: "Running Speed and Cadence",
    serviceUuid: BLE_SERVICE_UUIDS.RUNNING_SPEED_AND_CADENCE,
    measurementCharacteristicUuid: BLE_CHARACTERISTIC_UUIDS.RUNNING_SPEED_AND_CADENCE_MEASUREMENT,
    metrics: [
      { metric: "speed", requirement: "required" },
      { metric: "cadence", requirement: "required" },
    ],
  },
] as const;

function normalizeUuid(uuid: string): string {
  return uuid.toLowerCase();
}

export function listStandardBleProfileDefinitions(): readonly StandardBleProfileDefinition[] {
  return STANDARD_BLE_PROFILE_DEFINITIONS;
}

export function getStandardBleProfileDefinition(
  profileId: StandardBleProfileId,
): StandardBleProfileDefinition {
  const definition = STANDARD_BLE_PROFILE_DEFINITIONS.find(({ id }) => id === profileId);
  if (!definition) {
    throw new Error(`Unknown standard BLE profile: ${profileId}`);
  }
  return definition;
}

export function matchStandardBleProfiles(input: {
  services: readonly string[];
  characteristics: ReadonlyMap<string, string>;
}): StandardBleProfileDefinition[] {
  const services = new Set(input.services.map(normalizeUuid));

  return STANDARD_BLE_PROFILE_DEFINITIONS.filter((definition) => {
    const serviceUuid = normalizeUuid(definition.serviceUuid);
    const characteristicServiceUuid = input.characteristics.get(
      normalizeUuid(definition.measurementCharacteristicUuid),
    );

    return (
      services.has(serviceUuid) && normalizeUuid(characteristicServiceUuid ?? "") === serviceUuid
    );
  });
}
