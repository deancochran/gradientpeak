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
