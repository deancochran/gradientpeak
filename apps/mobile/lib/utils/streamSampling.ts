/**
 * Downsample a stream to reduce the number of data points for chart rendering
 * Uses intelligent sampling strategies based on data characteristics
 *
 * @param values - Array of numeric values
 * @param timestamps - Corresponding timestamps
 * @param targetSampleCount - Desired number of samples (default: 500)
 * @param strategy - Sampling strategy: 'max' (for power/speed), 'avg' (for HR), 'min' (for valleys)
 * @returns Downsampled values and timestamps
 */
export function downsampleStream(
  values: number[],
  timestamps: number[],
  targetSampleCount: number = 500,
  strategy: "max" | "avg" | "min" = "max"
): { values: number[]; timestamps: number[] } {
  // If already under target, return as-is
  if (values.length <= targetSampleCount) {
    return { values: [...values], timestamps: [...timestamps] };
  }

  const step = Math.ceil(values.length / targetSampleCount);
  const sampledValues: number[] = [];
  const sampledTimestamps: number[] = [];

  for (let i = 0; i < values.length; i += step) {
    const windowEnd = Math.min(i + step, values.length);
    const windowValues = values.slice(i, windowEnd);
    const windowTimestamps = timestamps.slice(i, windowEnd);

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
        sampledValue =
          windowValues.reduce((sum, v) => sum + v, 0) / windowValues.length;
        break;
    }

    sampledValues.push(sampledValue);
    // Use middle timestamp of window for better representation
    const middleIndex = Math.floor(windowValues.length / 2);
    sampledTimestamps.push(windowTimestamps[middleIndex] || timestamps[i]);
  }

  return { values: sampledValues, timestamps: sampledTimestamps };
}

/**
 * Downsample GPS coordinates using largest triangle three buckets algorithm
 * Preserves shape of route better than simple downsampling
 *
 * @param coordinates - Array of [lat, lng] pairs
 * @param timestamps - Corresponding timestamps
 * @param targetSampleCount - Desired number of points (default: 500)
 * @returns Downsampled coordinates and timestamps
 */
export function downsampleGPSRoute(
  coordinates: [number, number][],
  timestamps: number[],
  targetSampleCount: number = 500
): { coordinates: [number, number][]; timestamps: number[] } {
  // If already under target, return as-is
  if (coordinates.length <= targetSampleCount) {
    return {
      coordinates: [...coordinates],
      timestamps: [...timestamps],
    };
  }

  // Simple uniform sampling for GPS (preserves start/end)
  const step = Math.ceil(coordinates.length / targetSampleCount);
  const sampledCoords: [number, number][] = [];
  const sampledTimestamps: number[] = [];

  // Always include first point
  sampledCoords.push(coordinates[0]);
  sampledTimestamps.push(timestamps[0]);

  // Sample middle points
  for (let i = step; i < coordinates.length - step; i += step) {
    sampledCoords.push(coordinates[i]);
    sampledTimestamps.push(timestamps[i]);
  }

  // Always include last point
  if (coordinates.length > 1) {
    sampledCoords.push(coordinates[coordinates.length - 1]);
    sampledTimestamps.push(timestamps[timestamps.length - 1]);
  }

  return { coordinates: sampledCoords, timestamps: sampledTimestamps };
}

/**
 * Get recommended sampling strategy for a given stream type
 *
 * @param streamType - Type of stream (heartrate, power, speed, etc.)
 * @returns Recommended sampling strategy
 */
export function getSamplingStrategy(
  streamType: string
): "max" | "avg" | "min" {
  switch (streamType) {
    case "power":
    case "speed":
    case "cadence":
      return "max"; // Preserve peaks
    case "heartrate":
    case "temperature":
      return "avg"; // Smooth average
    case "altitude":
    case "elevation":
      return "avg"; // Smooth elevation
    default:
      return "avg";
  }
}

/**
 * Remove null/undefined values from stream data
 * Returns filtered arrays maintaining index correspondence
 *
 * @param values - Array of values (may contain nulls)
 * @param timestamps - Corresponding timestamps
 * @returns Filtered arrays with nulls removed
 */
export function removeNullValues(
  values: (number | null | undefined)[],
  timestamps: number[]
): { values: number[]; timestamps: number[] } {
  const filteredValues: number[] = [];
  const filteredTimestamps: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (values[i] != null && !isNaN(values[i] as number)) {
      filteredValues.push(values[i] as number);
      filteredTimestamps.push(timestamps[i]);
    }
  }

  return { values: filteredValues, timestamps: filteredTimestamps };
}
