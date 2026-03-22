export type StreamSamplingStrategy = "max" | "avg" | "min";

export function downsampleStream(
  values: number[],
  timestamps: number[],
  targetSampleCount = 500,
  strategy: StreamSamplingStrategy = "max",
): { values: number[]; timestamps: number[] } {
  if (values.length <= targetSampleCount) {
    return { values: [...values], timestamps: [...timestamps] };
  }

  const step = Math.ceil(values.length / targetSampleCount);
  const sampledValues: number[] = [];
  const sampledTimestamps: number[] = [];

  for (let index = 0; index < values.length; index += step) {
    const windowEnd = Math.min(index + step, values.length);
    const windowValues = values.slice(index, windowEnd);
    const windowTimestamps = timestamps.slice(index, windowEnd);

    let sampledValue: number;
    switch (strategy) {
      case "max":
        sampledValue = Math.max(...windowValues);
        break;
      case "min":
        sampledValue = Math.min(...windowValues);
        break;
      case "avg":
      default:
        sampledValue = windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length;
        break;
    }

    sampledValues.push(sampledValue);
    const middleIndex = Math.floor(windowValues.length / 2);
    sampledTimestamps.push(windowTimestamps[middleIndex] ?? timestamps[index] ?? 0);
  }

  return { values: sampledValues, timestamps: sampledTimestamps };
}

export function downsampleGPSRoute(
  coordinates: [number, number][],
  timestamps: number[],
  targetSampleCount = 500,
): { coordinates: [number, number][]; timestamps: number[] } {
  if (coordinates.length <= targetSampleCount) {
    return {
      coordinates: [...coordinates],
      timestamps: [...timestamps],
    };
  }

  const step = Math.ceil(coordinates.length / targetSampleCount);
  const sampledCoordinates: [number, number][] = [];
  const sampledTimestamps: number[] = [];

  sampledCoordinates.push(coordinates[0] ?? [0, 0]);
  sampledTimestamps.push(timestamps[0] ?? 0);

  for (let index = step; index < coordinates.length - step; index += step) {
    sampledCoordinates.push(coordinates[index] ?? [0, 0]);
    sampledTimestamps.push(timestamps[index] ?? 0);
  }

  if (coordinates.length > 1) {
    sampledCoordinates.push(coordinates[coordinates.length - 1] ?? [0, 0]);
    sampledTimestamps.push(timestamps[timestamps.length - 1] ?? 0);
  }

  return { coordinates: sampledCoordinates, timestamps: sampledTimestamps };
}

export function getSamplingStrategy(streamType: string): StreamSamplingStrategy {
  switch (streamType) {
    case "power":
    case "speed":
    case "cadence":
      return "max";
    case "heartrate":
    case "temperature":
    case "altitude":
    case "elevation":
      return "avg";
    default:
      return "avg";
  }
}

export function removeNullValues(
  values: Array<number | null | undefined>,
  timestamps: number[],
): { values: number[]; timestamps: number[] } {
  const filteredValues: number[] = [];
  const filteredTimestamps: number[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value != null && !Number.isNaN(value)) {
      filteredValues.push(value);
      filteredTimestamps.push(timestamps[index] ?? 0);
    }
  }

  return { values: filteredValues, timestamps: filteredTimestamps };
}
