import { FTMS_CHARACTERISTICS } from "../constants/ble";
import type {
  FtmsMachineType,
  FtmsParserDefinition,
  FtmsRuntimeMetrics,
  FtmsStatusPayload,
  ParsedFtmsPayload,
} from "../ftms-types";
import { toDataView, unsignedDeltaWithWrap } from "./utils";

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

export interface ParsedFtmsIndoorBikeData extends BleParserMetrics {
  truncated: boolean;
}

type FtmsFieldReader = {
  get offset(): number;
  get truncated(): boolean;
  get byteLength(): number;
  readUint8(): number | null;
  readUint16(): number | null;
  readInt16(): number | null;
  readUint24(): number | null;
  skip(bytes: number): void;
};

function createEmptyMetrics(): BleParserMetrics {
  return {
    hrBpm: null,
    powerWatts: null,
    cadenceRpm: null,
    speedMps: null,
  };
}

function safeRound(value: number, digits: number = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function createEmptyFtmsMetrics(): FtmsRuntimeMetrics {
  return {
    ...createEmptyMetrics(),
    distanceMeters: null,
    elapsedTimeSeconds: null,
    energyKcal: null,
    stepCount: null,
    strideCount: null,
    floorCount: null,
    inclinationPercent: null,
    resistanceLevel: null,
    strokeRateSpm: null,
    strokeCount: null,
  };
}

function createFtmsFieldReader(view: DataView, initialOffset: number): FtmsFieldReader {
  let offset = initialOffset;
  let truncated = false;

  const read = (bytes: number, getter: (currentOffset: number) => number): number | null => {
    if (offset + bytes > view.byteLength) {
      truncated = true;
      return null;
    }

    const value = getter(offset);
    offset += bytes;
    return value;
  };

  return {
    get offset() {
      return offset;
    },
    get truncated() {
      return truncated;
    },
    get byteLength() {
      return view.byteLength;
    },
    readUint8: () => read(1, (currentOffset) => view.getUint8(currentOffset)),
    readUint16: () => read(2, (currentOffset) => view.getUint16(currentOffset, true)),
    readInt16: () => read(2, (currentOffset) => view.getInt16(currentOffset, true)),
    readUint24: () =>
      read(
        3,
        (currentOffset) =>
          view.getUint8(currentOffset) |
          (view.getUint8(currentOffset + 1) << 8) |
          (view.getUint8(currentOffset + 2) << 16),
      ),
    skip(bytes: number) {
      if (offset + bytes > view.byteLength) {
        truncated = true;
        offset = view.byteLength;
        return;
      }

      offset += bytes;
    },
  };
}

function normalizeUuid(uuid: string): string {
  return uuid.toLowerCase();
}

function kmhHundredthsToMps(value: number): number {
  return safeRound((value * 0.01) / 3.6, 3);
}

function buildParsedFtmsPayload(input: {
  characteristicUuid: string;
  machineType: FtmsMachineType;
  kind?: ParsedFtmsPayload["kind"];
  metrics?: FtmsRuntimeMetrics;
  status?: FtmsStatusPayload | null;
  flags?: number;
  reader?: Pick<FtmsFieldReader, "offset" | "truncated" | "byteLength">;
  byteLength?: number;
  truncated?: boolean;
}): ParsedFtmsPayload {
  const byteLength = input.reader?.byteLength ?? input.byteLength ?? 0;
  const bytesRead = input.reader?.offset ?? byteLength;

  return {
    kind: input.kind ?? "measurement",
    characteristicUuid: normalizeUuid(input.characteristicUuid),
    machineType: input.machineType,
    metrics: input.metrics ?? createEmptyFtmsMetrics(),
    status: input.status ?? null,
    diagnostics: {
      truncated: input.reader?.truncated ?? input.truncated ?? false,
      flags: input.flags,
      bytesRead,
      byteLength,
    },
  };
}

function parseFtmsMeasurement(
  data: ArrayBuffer | Uint8Array,
  characteristicUuid: string,
  machineType: FtmsMachineType,
  parseFields: (flags: number, reader: FtmsFieldReader, metrics: FtmsRuntimeMetrics) => void,
): ParsedFtmsPayload {
  const view = toDataView(data);
  const metrics = createEmptyFtmsMetrics();

  if (view.byteLength < 2) {
    return buildParsedFtmsPayload({
      characteristicUuid,
      machineType,
      metrics,
      byteLength: view.byteLength,
      truncated: true,
    });
  }

  const flags = view.getUint16(0, true);
  const reader = createFtmsFieldReader(view, 2);
  parseFields(flags, reader, metrics);

  return buildParsedFtmsPayload({
    characteristicUuid,
    machineType,
    metrics,
    flags,
    reader,
  });
}

function readEnergyBlock(reader: FtmsFieldReader, metrics: FtmsRuntimeMetrics): void {
  const totalEnergy = reader.readUint16();
  reader.skip(2);
  reader.skip(1);

  if (totalEnergy !== null) {
    metrics.energyKcal = totalEnergy;
  }
}

function readHeartRate(reader: FtmsFieldReader, metrics: FtmsRuntimeMetrics): void {
  const heartRate = reader.readUint8();

  if (heartRate !== null) {
    metrics.hrBpm = heartRate;
  }
}

function readElapsedTime(reader: FtmsFieldReader, metrics: FtmsRuntimeMetrics): void {
  const elapsed = reader.readUint16();

  if (elapsed !== null) {
    metrics.elapsedTimeSeconds = elapsed;
  }
}

/**
 * Parses BLE Heart Rate Measurement characteristic (0x2A37).
 */
export function parseHeartRateMeasurement(data: ArrayBuffer | Uint8Array): BleParserMetrics {
  const metrics = createEmptyMetrics();
  const view = toDataView(data);

  if (view.byteLength < 2) {
    return metrics;
  }

  const flags = view.getUint8(0);
  const is16Bit = (flags & 0x01) !== 0;

  if (is16Bit) {
    if (view.byteLength < 3) {
      return metrics;
    }
    metrics.hrBpm = view.getUint16(1, true);
    return metrics;
  }

  metrics.hrBpm = view.getUint8(1);
  return metrics;
}

/**
 * Parses BLE Cycling Power Measurement characteristic (0x2A63).
 */
export function parseCyclingPowerMeasurement(data: ArrayBuffer | Uint8Array): BleParserMetrics {
  const metrics = createEmptyMetrics();
  const view = toDataView(data);

  if (view.byteLength < 4) {
    return metrics;
  }

  metrics.powerWatts = view.getInt16(2, true);
  return metrics;
}

/**
 * Parses BLE Cycling Speed and Cadence measurement (0x2A5B).
 * Cadence is derived from crank revolution and event-time deltas.
 */
export function parseCscMeasurement(
  data: ArrayBuffer | Uint8Array,
  prevState?: CscParserState,
): ParsedCscMeasurement {
  const base = createEmptyMetrics();
  const view = toDataView(data);
  const nextState: CscParserState = {
    ...prevState,
  };

  if (view.byteLength < 1) {
    return { ...base, nextState };
  }

  const flags = view.getUint8(0);
  let offset = 1;

  if ((flags & 0x01) !== 0) {
    if (view.byteLength < offset + 6) {
      return { ...base, nextState };
    }

    const wheelRevolutions = view.getUint32(offset, true);
    offset += 4;
    const wheelEventTime1024 = view.getUint16(offset, true);
    offset += 2;

    if (
      typeof prevState?.lastWheelRevolutions === "number" &&
      typeof prevState.lastWheelEventTime1024 === "number" &&
      typeof prevState.wheelCircumferenceMeters === "number" &&
      prevState.wheelCircumferenceMeters > 0
    ) {
      const deltaRevolutions = unsignedDeltaWithWrap(
        wheelRevolutions,
        prevState.lastWheelRevolutions,
        32,
      );
      const deltaTimeTicks = unsignedDeltaWithWrap(
        wheelEventTime1024,
        prevState.lastWheelEventTime1024,
        16,
      );

      if (deltaRevolutions > 0 && deltaTimeTicks > 0) {
        const deltaSeconds = deltaTimeTicks / 1024;
        const distanceMeters = deltaRevolutions * prevState.wheelCircumferenceMeters;
        base.speedMps = safeRound(distanceMeters / deltaSeconds, 3);
      }
    }

    nextState.lastWheelRevolutions = wheelRevolutions;
    nextState.lastWheelEventTime1024 = wheelEventTime1024;
  }

  if ((flags & 0x02) !== 0) {
    if (view.byteLength < offset + 4) {
      return { ...base, nextState };
    }

    const crankRevolutions = view.getUint16(offset, true);
    offset += 2;
    const crankEventTime1024 = view.getUint16(offset, true);

    if (
      typeof prevState?.lastCrankRevolutions === "number" &&
      typeof prevState.lastCrankEventTime1024 === "number"
    ) {
      const deltaRevolutions = unsignedDeltaWithWrap(
        crankRevolutions,
        prevState.lastCrankRevolutions,
        16,
      );
      const deltaTimeTicks = unsignedDeltaWithWrap(
        crankEventTime1024,
        prevState.lastCrankEventTime1024,
        16,
      );

      if (deltaRevolutions > 0 && deltaTimeTicks > 0) {
        const deltaSeconds = deltaTimeTicks / 1024;
        base.cadenceRpm = safeRound((deltaRevolutions / deltaSeconds) * 60, 2);
      }
    }

    nextState.lastCrankRevolutions = crankRevolutions;
    nextState.lastCrankEventTime1024 = crankEventTime1024;
  }

  return {
    ...base,
    nextState,
  };
}

/**
 * Parses FTMS Indoor Bike Data characteristic (0x2AD2) with dynamic offsets.
 */
export function parseFtmsIndoorBikeData(data: ArrayBuffer | Uint8Array): ParsedFtmsIndoorBikeData {
  const metrics = createEmptyMetrics();
  const view = toDataView(data);

  if (view.byteLength < 2) {
    return { ...metrics, truncated: true };
  }

  const flags = view.getUint16(0, true);
  let offset = 2;
  let truncated = false;

  const readUint8 = (): number | null => {
    if (offset + 1 > view.byteLength) {
      truncated = true;
      return null;
    }
    const value = view.getUint8(offset);
    offset += 1;
    return value;
  };

  const readUint16 = (): number | null => {
    if (offset + 2 > view.byteLength) {
      truncated = true;
      return null;
    }
    const value = view.getUint16(offset, true);
    offset += 2;
    return value;
  };

  const readInt16 = (): number | null => {
    if (offset + 2 > view.byteLength) {
      truncated = true;
      return null;
    }
    const value = view.getInt16(offset, true);
    offset += 2;
    return value;
  };

  const readUint24 = (): number | null => {
    if (offset + 3 > view.byteLength) {
      truncated = true;
      return null;
    }
    const value =
      view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    offset += 3;
    return value;
  };

  const hasMoreData = (flags & 0x01) !== 0;

  if (!hasMoreData) {
    const rawInstantaneousSpeed = readUint16();
    if (rawInstantaneousSpeed !== null) {
      metrics.speedMps = safeRound((rawInstantaneousSpeed * 0.01) / 3.6, 3);
    } else if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x02) !== 0) {
    const rawAverageSpeed = readUint16();
    if (metrics.speedMps === null && rawAverageSpeed !== null) {
      metrics.speedMps = safeRound((rawAverageSpeed * 0.01) / 3.6, 3);
    } else if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x04) !== 0) {
    const rawCadence = readUint16();
    if (rawCadence !== null) {
      metrics.cadenceRpm = rawCadence * 0.5;
    } else if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x08) !== 0) {
    const rawAverageCadence = readUint16();
    if (metrics.cadenceRpm === null && rawAverageCadence !== null) {
      metrics.cadenceRpm = rawAverageCadence * 0.5;
    } else if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x10) !== 0) {
    readUint24();
    if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x20) !== 0) {
    readInt16();
    if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x40) !== 0) {
    const rawPower = readInt16();
    if (rawPower !== null) {
      metrics.powerWatts = rawPower;
    } else if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x80) !== 0) {
    const rawAveragePower = readInt16();
    if (metrics.powerWatts === null && rawAveragePower !== null) {
      metrics.powerWatts = rawAveragePower;
    } else if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x100) !== 0) {
    readUint16();
    if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
    readUint16();
    if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
    readUint8();
    if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x200) !== 0) {
    const rawHeartRate = readUint8();
    if (rawHeartRate !== null) {
      metrics.hrBpm = rawHeartRate;
    } else if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x400) !== 0) {
    readUint8();
    if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x800) !== 0) {
    readUint16();
    if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  if ((flags & 0x1000) !== 0) {
    readUint16();
    if (truncated) {
      return {
        ...metrics,
        truncated,
      };
    }
  }

  return {
    ...metrics,
    truncated,
  };
}

export function parseFtmsTreadmillData(data: ArrayBuffer | Uint8Array): ParsedFtmsPayload {
  return parseFtmsMeasurement(
    data,
    FTMS_CHARACTERISTICS.TREADMILL_DATA,
    "treadmill",
    (flags, reader, metrics) => {
      if ((flags & 0x01) === 0) {
        const speed = reader.readUint16();
        if (speed !== null) metrics.speedMps = kmhHundredthsToMps(speed);
      }
      if ((flags & 0x02) !== 0) reader.skip(2);
      if ((flags & 0x04) !== 0) metrics.distanceMeters = reader.readUint24();
      if ((flags & 0x08) !== 0) {
        const inclination = reader.readInt16();
        reader.skip(2);
        if (inclination !== null) metrics.inclinationPercent = safeRound(inclination * 0.1, 1);
      }
      if ((flags & 0x10) !== 0) reader.skip(4);
      if ((flags & 0x20) !== 0) reader.skip(1);
      if ((flags & 0x40) !== 0) reader.skip(1);
      if ((flags & 0x80) !== 0) readEnergyBlock(reader, metrics);
      if ((flags & 0x100) !== 0) readHeartRate(reader, metrics);
      if ((flags & 0x200) !== 0) reader.skip(1);
      if ((flags & 0x400) !== 0) readElapsedTime(reader, metrics);
      if ((flags & 0x800) !== 0) reader.skip(2);
      if ((flags & 0x1000) !== 0) {
        const force = reader.readInt16();
        if (force !== null) metrics.powerWatts = force;
      }
    },
  );
}

export function parseFtmsCrossTrainerData(data: ArrayBuffer | Uint8Array): ParsedFtmsPayload {
  return parseFtmsMeasurement(
    data,
    FTMS_CHARACTERISTICS.CROSS_TRAINER_DATA,
    "cross_trainer",
    (flags, reader, metrics) => {
      if ((flags & 0x01) === 0) {
        const speed = reader.readUint16();
        if (speed !== null) metrics.speedMps = kmhHundredthsToMps(speed);
      }
      if ((flags & 0x02) !== 0) reader.skip(2);
      if ((flags & 0x04) !== 0) metrics.distanceMeters = reader.readUint24();
      if ((flags & 0x08) !== 0) metrics.stepCount = reader.readUint16();
      if ((flags & 0x10) !== 0) metrics.strideCount = reader.readUint16();
      if ((flags & 0x20) !== 0) reader.skip(4);
      if ((flags & 0x40) !== 0) {
        const inclination = reader.readInt16();
        reader.skip(2);
        if (inclination !== null) metrics.inclinationPercent = safeRound(inclination * 0.1, 1);
      }
      if ((flags & 0x80) !== 0) {
        const resistance = reader.readInt16();
        if (resistance !== null) metrics.resistanceLevel = resistance * 0.1;
      }
      if ((flags & 0x100) !== 0) readEnergyBlock(reader, metrics);
      if ((flags & 0x200) !== 0) readHeartRate(reader, metrics);
      if ((flags & 0x400) !== 0) reader.skip(1);
      if ((flags & 0x800) !== 0) readElapsedTime(reader, metrics);
      if ((flags & 0x1000) !== 0) reader.skip(2);
      if ((flags & 0x2000) !== 0) {
        const power = reader.readInt16();
        if (power !== null) metrics.powerWatts = power;
      }
    },
  );
}

export function parseFtmsStepClimberData(data: ArrayBuffer | Uint8Array): ParsedFtmsPayload {
  return parseFtmsMeasurement(
    data,
    FTMS_CHARACTERISTICS.STEP_CLIMBER_DATA,
    "step_climber",
    (flags, reader, metrics) => {
      if ((flags & 0x01) === 0) {
        const cadence = reader.readUint16();
        if (cadence !== null) metrics.cadenceRpm = cadence * 0.1;
      }
      if ((flags & 0x02) !== 0) reader.skip(2);
      if ((flags & 0x04) !== 0) metrics.stepCount = reader.readUint16();
      if ((flags & 0x08) !== 0) metrics.floorCount = reader.readUint16();
      if ((flags & 0x10) !== 0) readEnergyBlock(reader, metrics);
      if ((flags & 0x20) !== 0) readHeartRate(reader, metrics);
      if ((flags & 0x40) !== 0) reader.skip(1);
      if ((flags & 0x80) !== 0) readElapsedTime(reader, metrics);
      if ((flags & 0x100) !== 0) reader.skip(2);
    },
  );
}

export function parseFtmsStairClimberData(data: ArrayBuffer | Uint8Array): ParsedFtmsPayload {
  return parseFtmsMeasurement(
    data,
    FTMS_CHARACTERISTICS.STAIR_CLIMBER_DATA,
    "stair_climber",
    (flags, reader, metrics) => {
      if ((flags & 0x01) === 0) {
        const cadence = reader.readUint16();
        if (cadence !== null) metrics.cadenceRpm = cadence * 0.1;
      }
      if ((flags & 0x02) !== 0) reader.skip(2);
      if ((flags & 0x04) !== 0) metrics.floorCount = reader.readUint16();
      if ((flags & 0x08) !== 0) metrics.stepCount = reader.readUint16();
      if ((flags & 0x10) !== 0) readEnergyBlock(reader, metrics);
      if ((flags & 0x20) !== 0) readHeartRate(reader, metrics);
      if ((flags & 0x40) !== 0) reader.skip(1);
      if ((flags & 0x80) !== 0) readElapsedTime(reader, metrics);
      if ((flags & 0x100) !== 0) reader.skip(2);
    },
  );
}

export function parseFtmsRowerData(data: ArrayBuffer | Uint8Array): ParsedFtmsPayload {
  return parseFtmsMeasurement(
    data,
    FTMS_CHARACTERISTICS.ROWER_DATA,
    "rower",
    (flags, reader, metrics) => {
      if ((flags & 0x01) === 0) {
        const strokeRate = reader.readUint8();
        const strokeCount = reader.readUint16();
        if (strokeRate !== null) metrics.strokeRateSpm = strokeRate * 0.5;
        if (strokeCount !== null) metrics.strokeCount = strokeCount;
      }
      if ((flags & 0x02) !== 0) reader.skip(3);
      if ((flags & 0x04) !== 0) metrics.distanceMeters = reader.readUint24();
      if ((flags & 0x08) !== 0) reader.skip(2);
      if ((flags & 0x10) !== 0) reader.skip(2);
      if ((flags & 0x20) !== 0) readEnergyBlock(reader, metrics);
      if ((flags & 0x40) !== 0) readHeartRate(reader, metrics);
      if ((flags & 0x80) !== 0) reader.skip(1);
      if ((flags & 0x100) !== 0) readElapsedTime(reader, metrics);
      if ((flags & 0x200) !== 0) reader.skip(2);
    },
  );
}

export function parseFtmsTrainingStatus(data: ArrayBuffer | Uint8Array): ParsedFtmsPayload {
  const view = toDataView(data);
  const code = view.byteLength >= 1 ? view.getUint8(0) : null;
  const status: FtmsStatusPayload = {
    code,
    label: code === null ? "unknown" : (FTMS_TRAINING_STATUS_LABELS[code] ?? "reserved"),
  };

  return buildParsedFtmsPayload({
    characteristicUuid: FTMS_CHARACTERISTICS.TRAINING_STATUS,
    machineType: "unknown",
    kind: "training_status",
    status,
    byteLength: view.byteLength,
    truncated: view.byteLength < 1,
  });
}

export function parseFtmsMachineStatus(data: ArrayBuffer | Uint8Array): ParsedFtmsPayload {
  const view = toDataView(data);
  const code = view.byteLength >= 1 ? view.getUint8(0) : null;
  const status: FtmsStatusPayload = {
    code,
    label: code === null ? "unknown" : (FTMS_MACHINE_STATUS_LABELS[code] ?? "reserved"),
    parameter: view.byteLength >= 3 ? view.getUint16(1, true) : undefined,
  };

  return buildParsedFtmsPayload({
    characteristicUuid: FTMS_CHARACTERISTICS.STATUS,
    machineType: "unknown",
    kind: "machine_status",
    status,
    byteLength: view.byteLength,
    truncated: view.byteLength < 1,
  });
}

export function parseFtmsIndoorBikeMeasurement(data: ArrayBuffer | Uint8Array): ParsedFtmsPayload {
  const parsed = parseFtmsIndoorBikeData(data);
  return buildParsedFtmsPayload({
    characteristicUuid: FTMS_CHARACTERISTICS.INDOOR_BIKE_DATA,
    machineType: "bike",
    metrics: {
      ...createEmptyFtmsMetrics(),
      hrBpm: parsed.hrBpm,
      powerWatts: parsed.powerWatts,
      cadenceRpm: parsed.cadenceRpm,
      speedMps: parsed.speedMps,
    },
    byteLength: toDataView(data).byteLength,
    truncated: parsed.truncated,
  });
}

const FTMS_TRAINING_STATUS_LABELS: Record<number, string> = {
  0: "other",
  1: "idle",
  2: "warming_up",
  3: "low_intensity_interval",
  4: "high_intensity_interval",
  5: "recovery_interval",
  6: "isometric",
  7: "heart_rate_control",
  8: "fitness_test",
  9: "speed_outside_control_region_low",
  10: "speed_outside_control_region_high",
  11: "cool_down",
  12: "watt_control",
  13: "manual_mode",
  14: "pre_workout",
  15: "post_workout",
};

const FTMS_MACHINE_STATUS_LABELS: Record<number, string> = {
  0: "reset",
  1: "stopped_or_paused_by_user",
  2: "stopped_by_safety_key",
  3: "started_or_resumed_by_user",
  4: "target_speed_changed",
  5: "target_inclination_changed",
  6: "target_resistance_changed",
  7: "target_power_changed",
  8: "target_heart_rate_changed",
  19: "spin_down_status",
  20: "target_cadence_changed",
};

export const FTMS_PARSER_DEFINITIONS_BY_UUID = {
  [FTMS_CHARACTERISTICS.TREADMILL_DATA]: {
    uuid: FTMS_CHARACTERISTICS.TREADMILL_DATA,
    name: "Treadmill Data",
    kind: "measurement",
    machineType: "treadmill",
    parse: parseFtmsTreadmillData,
  },
  [FTMS_CHARACTERISTICS.CROSS_TRAINER_DATA]: {
    uuid: FTMS_CHARACTERISTICS.CROSS_TRAINER_DATA,
    name: "Cross Trainer Data",
    kind: "measurement",
    machineType: "cross_trainer",
    parse: parseFtmsCrossTrainerData,
  },
  [FTMS_CHARACTERISTICS.STEP_CLIMBER_DATA]: {
    uuid: FTMS_CHARACTERISTICS.STEP_CLIMBER_DATA,
    name: "Step Climber Data",
    kind: "measurement",
    machineType: "step_climber",
    parse: parseFtmsStepClimberData,
  },
  [FTMS_CHARACTERISTICS.STAIR_CLIMBER_DATA]: {
    uuid: FTMS_CHARACTERISTICS.STAIR_CLIMBER_DATA,
    name: "Stair Climber Data",
    kind: "measurement",
    machineType: "stair_climber",
    parse: parseFtmsStairClimberData,
  },
  [FTMS_CHARACTERISTICS.ROWER_DATA]: {
    uuid: FTMS_CHARACTERISTICS.ROWER_DATA,
    name: "Rower Data",
    kind: "measurement",
    machineType: "rower",
    parse: parseFtmsRowerData,
  },
  [FTMS_CHARACTERISTICS.INDOOR_BIKE_DATA]: {
    uuid: FTMS_CHARACTERISTICS.INDOOR_BIKE_DATA,
    name: "Indoor Bike Data",
    kind: "measurement",
    machineType: "bike",
    parse: parseFtmsIndoorBikeMeasurement,
  },
  [FTMS_CHARACTERISTICS.TRAINING_STATUS]: {
    uuid: FTMS_CHARACTERISTICS.TRAINING_STATUS,
    name: "Training Status",
    kind: "training_status",
    machineType: "unknown",
    parse: parseFtmsTrainingStatus,
  },
  [FTMS_CHARACTERISTICS.STATUS]: {
    uuid: FTMS_CHARACTERISTICS.STATUS,
    name: "Fitness Machine Status",
    kind: "machine_status",
    machineType: "unknown",
    parse: parseFtmsMachineStatus,
  },
} as const satisfies Record<string, FtmsParserDefinition>;

export function getFtmsParserDefinition(uuid: string): FtmsParserDefinition | undefined {
  return (FTMS_PARSER_DEFINITIONS_BY_UUID as Record<string, FtmsParserDefinition>)[
    normalizeUuid(uuid)
  ];
}

export function listFtmsParserDefinitions(): FtmsParserDefinition[] {
  return Object.values(FTMS_PARSER_DEFINITIONS_BY_UUID);
}

export function parseRegisteredFtmsPayload(
  uuid: string,
  data: ArrayBuffer | Uint8Array,
): ParsedFtmsPayload | null {
  return getFtmsParserDefinition(uuid)?.parse(data) ?? null;
}
