import { toDataView, unsignedDeltaWithWrap } from "./utils";

export type { ParsedFtmsIndoorBikeData } from "@deancochran/ftms";
export {
  FTMS_PARSER_DEFINITIONS_BY_UUID,
  getFtmsParserDefinition,
  listFtmsParserDefinitions,
  parseFtmsCrossTrainerData,
  parseFtmsIndoorBikeData,
  parseFtmsIndoorBikeMeasurement,
  parseFtmsMachineStatus,
  parseFtmsRowerData,
  parseFtmsStairClimberData,
  parseFtmsStepClimberData,
  parseFtmsTrainingStatus,
  parseFtmsTreadmillData,
  parseRegisteredFtmsPayload,
} from "@deancochran/ftms";

export interface BleParserMetrics {
  hrBpm: number | null;
  powerWatts: number | null;
  cadenceRpm: number | null;
  speedMps: number | null;
}

export interface CscParserState {
  lastCrankRevolutions?: number;
  lastCrankEventTime1024?: number;
  lastWheelRevolutions?: number;
  lastWheelEventTime1024?: number;
  wheelCircumferenceMeters?: number;
}

export interface ParsedCscMeasurement extends BleParserMetrics {
  nextState: CscParserState;
}

export interface CyclingPowerParserState {
  lastCrankRevolutions?: number;
  lastCrankEventTime1024?: number;
}

export interface ParsedCyclingPowerMeasurement extends BleParserMetrics {
  nextState: CyclingPowerParserState;
  truncated: boolean;
}

function createEmptyMetrics(): BleParserMetrics {
  return {
    hrBpm: null,
    powerWatts: null,
    cadenceRpm: null,
    speedMps: null,
  };
}

function safeRound(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** Parses BLE Heart Rate Measurement characteristic (0x2A37). */
export function parseHeartRateMeasurement(data: ArrayBuffer | Uint8Array): BleParserMetrics {
  const metrics = createEmptyMetrics();
  const view = toDataView(data);
  if (view.byteLength < 2) return metrics;

  const is16Bit = (view.getUint8(0) & 0x01) !== 0;
  if (is16Bit) {
    if (view.byteLength < 3) return metrics;
    metrics.hrBpm = view.getUint16(1, true);
  } else {
    metrics.hrBpm = view.getUint8(1);
  }
  return metrics;
}

/** Parses BLE Cycling Power Measurement characteristic (0x2A63). */
export function parseCyclingPowerMeasurement(data: ArrayBuffer | Uint8Array): BleParserMetrics {
  return parseCyclingPowerMeasurementWithState(data);
}

/** Parses Cycling Power Measurement and derives cadence from crank deltas. */
export function parseCyclingPowerMeasurementWithState(
  data: ArrayBuffer | Uint8Array,
  previousState?: CyclingPowerParserState,
): ParsedCyclingPowerMeasurement {
  const metrics = createEmptyMetrics();
  const view = toDataView(data);
  const nextState: CyclingPowerParserState = { ...previousState };
  if (view.byteLength < 4) {
    return { ...metrics, nextState, truncated: true };
  }

  const flags = view.getUint16(0, true);
  metrics.powerWatts = view.getInt16(2, true);
  let offset = 4;

  if ((flags & (1 << 0)) !== 0) offset += 1;
  if ((flags & (1 << 2)) !== 0) offset += 2;
  if ((flags & (1 << 4)) !== 0) offset += 6;

  if ((flags & (1 << 5)) !== 0) {
    if (view.byteLength < offset + 4) {
      return { ...metrics, nextState, truncated: true };
    }

    const crankRevolutions = view.getUint16(offset, true);
    const crankEventTime1024 = view.getUint16(offset + 2, true);
    if (
      previousState?.lastCrankRevolutions !== undefined &&
      previousState.lastCrankEventTime1024 !== undefined
    ) {
      const deltaRevolutions = unsignedDeltaWithWrap(
        crankRevolutions,
        previousState.lastCrankRevolutions,
        16,
      );
      const deltaTimeTicks = unsignedDeltaWithWrap(
        crankEventTime1024,
        previousState.lastCrankEventTime1024,
        16,
      );
      if (deltaRevolutions > 0 && deltaTimeTicks > 0) {
        metrics.cadenceRpm = safeRound((deltaRevolutions * 60 * 1024) / deltaTimeTicks, 2);
      }
    }
    nextState.lastCrankRevolutions = crankRevolutions;
    nextState.lastCrankEventTime1024 = crankEventTime1024;
    offset += 4;
  }

  if ((flags & (1 << 6)) !== 0) offset += 4;
  if ((flags & (1 << 7)) !== 0) offset += 4;
  if ((flags & (1 << 8)) !== 0) offset += 3;
  if ((flags & (1 << 9)) !== 0) offset += 2;
  if ((flags & (1 << 10)) !== 0) offset += 2;
  if ((flags & (1 << 11)) !== 0) offset += 2;

  return { ...metrics, nextState, truncated: view.byteLength < offset };
}

/** Parses the mandatory fields of Running Speed and Cadence Measurement (0x2A53). */
export function parseRunningSpeedAndCadenceMeasurement(
  data: ArrayBuffer | Uint8Array,
): BleParserMetrics {
  const metrics = createEmptyMetrics();
  const view = toDataView(data);
  if (view.byteLength < 4) return metrics;

  metrics.speedMps = safeRound(view.getUint16(1, true) / 256, 3);
  metrics.cadenceRpm = view.getUint8(3);
  return metrics;
}

/** Parses BLE Cycling Speed and Cadence measurement (0x2A5B). */
export function parseCscMeasurement(
  data: ArrayBuffer | Uint8Array,
  previousState?: CscParserState,
): ParsedCscMeasurement {
  const metrics = createEmptyMetrics();
  const view = toDataView(data);
  const nextState: CscParserState = { ...previousState };
  if (view.byteLength < 1) return { ...metrics, nextState };

  const flags = view.getUint8(0);
  let offset = 1;

  if ((flags & 0x01) !== 0) {
    if (view.byteLength < offset + 6) return { ...metrics, nextState };
    const wheelRevolutions = view.getUint32(offset, true);
    offset += 4;
    const wheelEventTime1024 = view.getUint16(offset, true);
    offset += 2;

    if (
      previousState?.lastWheelRevolutions !== undefined &&
      previousState.lastWheelEventTime1024 !== undefined &&
      previousState.wheelCircumferenceMeters !== undefined &&
      previousState.wheelCircumferenceMeters > 0
    ) {
      const deltaRevolutions = unsignedDeltaWithWrap(
        wheelRevolutions,
        previousState.lastWheelRevolutions,
        32,
      );
      const deltaTimeTicks = unsignedDeltaWithWrap(
        wheelEventTime1024,
        previousState.lastWheelEventTime1024,
        16,
      );
      if (deltaRevolutions > 0 && deltaTimeTicks > 0) {
        const distanceMeters = deltaRevolutions * previousState.wheelCircumferenceMeters;
        metrics.speedMps = safeRound(distanceMeters / (deltaTimeTicks / 1024), 3);
      }
    }
    nextState.lastWheelRevolutions = wheelRevolutions;
    nextState.lastWheelEventTime1024 = wheelEventTime1024;
  }

  if ((flags & 0x02) !== 0) {
    if (view.byteLength < offset + 4) return { ...metrics, nextState };
    const crankRevolutions = view.getUint16(offset, true);
    const crankEventTime1024 = view.getUint16(offset + 2, true);

    if (
      previousState?.lastCrankRevolutions !== undefined &&
      previousState.lastCrankEventTime1024 !== undefined
    ) {
      const deltaRevolutions = unsignedDeltaWithWrap(
        crankRevolutions,
        previousState.lastCrankRevolutions,
        16,
      );
      const deltaTimeTicks = unsignedDeltaWithWrap(
        crankEventTime1024,
        previousState.lastCrankEventTime1024,
        16,
      );
      if (deltaRevolutions > 0 && deltaTimeTicks > 0) {
        metrics.cadenceRpm = safeRound((deltaRevolutions * 60 * 1024) / deltaTimeTicks, 2);
      }
    }
    nextState.lastCrankRevolutions = crankRevolutions;
    nextState.lastCrankEventTime1024 = crankEventTime1024;
  }

  return { ...metrics, nextState };
}
