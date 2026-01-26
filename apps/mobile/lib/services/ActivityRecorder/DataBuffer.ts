/**
 * DataBuffer - Simple Time-Based Rolling Window
 *
 * Maintains a 60-second window of sensor readings for real-time metric calculations.
 * Supports both numeric values (power, HR, etc.) and tuple values (lat/lng coordinates).
 * Automatically removes old data during periodic cleanup.
 */

import { RECORDING_CONFIG } from "./config";

/**
 * Reading with a numeric value (power, heart rate, cadence, etc.)
 */
export interface NumericBufferedReading {
  metric: string;
  value: number;
  timestamp: number;
}

/**
 * Reading with a tuple value (latitude/longitude)
 */
export interface LatLngBufferedReading {
  metric: string;
  value: [number, number];
  timestamp: number;
}

/**
 * Union type for all buffer readings
 */
export type BufferedReading = NumericBufferedReading | LatLngBufferedReading;

/**
 * Type guard to check if a reading is numeric
 */
function isNumericReading(
  reading: BufferedReading,
): reading is NumericBufferedReading {
  return typeof reading.value === "number";
}

/**
 * Type guard to check if a reading is lat/lng
 */
function isLatLngReading(
  reading: BufferedReading,
): reading is LatLngBufferedReading {
  return Array.isArray(reading.value);
}

export class DataBuffer {
  // Store readings by metric for O(1) access to specific streams
  private stores = new Map<string, BufferedReading[]>();
  private windowMs: number;

  constructor(windowSeconds: number = RECORDING_CONFIG.BUFFER_WINDOW_SECONDS) {
    this.windowMs = windowSeconds * 1000;
  }

  /**
   * Add a sensor reading to the buffer
   */
  add(reading: BufferedReading): void {
    if (!this.stores.has(reading.metric)) {
      this.stores.set(reading.metric, []);
    }
    this.stores.get(reading.metric)!.push(reading);
  }

  /**
   * Get recent numeric readings for a specific metric
   * @param metric - The metric name (e.g., "power", "heartrate")
   * @param seconds - How many seconds back to retrieve (default: 30)
   * @returns Array of numeric values
   */
  getRecent(metric: string, seconds: number = 30): number[] {
    const readings = this.stores.get(metric);
    if (!readings) return [];

    const cutoff = Date.now() - seconds * 1000;
    // Optimization: Binary search for start index could be added here if arrays get very large
    // For now, filter is O(M) where M is readings for this metric, much better than O(N)
    return readings
      .filter(
        (d): d is NumericBufferedReading =>
          d.timestamp > cutoff && isNumericReading(d),
      )
      .map((d) => d.value);
  }

  /**
   * Get recent lat/lng readings for a specific metric
   * @param metric - The metric name (should be "latlng")
   * @param seconds - How many seconds back to retrieve (default: 30)
   * @returns Array of [lat, lng] tuples
   */
  getRecentLatLng(metric: string, seconds: number = 30): [number, number][] {
    const readings = this.stores.get(metric);
    if (!readings) return [];

    const cutoff = Date.now() - seconds * 1000;
    return readings
      .filter(
        (d): d is LatLngBufferedReading =>
          d.timestamp > cutoff && isLatLngReading(d),
      )
      .map((d) => d.value);
  }

  /**
   * Get recent readings (with timestamps) for a specific metric
   * @param metric - The metric name
   * @param seconds - How many seconds back to retrieve (default: 30)
   * @returns Array of readings with values and timestamps
   */
  getRecentReadings(metric: string, seconds: number = 30): BufferedReading[] {
    const readings = this.stores.get(metric);
    if (!readings) return [];

    const cutoff = Date.now() - seconds * 1000;
    return readings.filter((d) => d.timestamp > cutoff);
  }

  /**
   * Get all numeric readings for a specific metric in the entire window
   */
  getAll(metric: string): number[] {
    const readings = this.stores.get(metric);
    if (!readings) return [];

    return readings
      .filter((d): d is NumericBufferedReading => isNumericReading(d))
      .map((d) => d.value);
  }

  /**
   * Get all lat/lng readings for a specific metric in the entire window
   */
  getAllLatLng(metric: string): [number, number][] {
    const readings = this.stores.get(metric);
    if (!readings) return [];

    return readings
      .filter((d): d is LatLngBufferedReading => isLatLngReading(d))
      .map((d) => d.value);
  }

  /**
   * Get the most recent value for a metric
   * Returns number for numeric metrics, undefined for non-numeric
   */
  getLatest(metric: string): number | undefined {
    const readings = this.stores.get(metric);
    if (!readings || readings.length === 0) return undefined;

    // Iterate backwards to find last numeric reading
    for (let i = readings.length - 1; i >= 0; i--) {
      const reading = readings[i];
      if (isNumericReading(reading)) {
        return reading.value;
      }
    }
    return undefined;
  }

  /**
   * Get the most recent lat/lng value for a metric
   * Returns [lat, lng] tuple or undefined
   */
  getLatestLatLng(metric: string): [number, number] | undefined {
    const readings = this.stores.get(metric);
    if (!readings || readings.length === 0) return undefined;

    for (let i = readings.length - 1; i >= 0; i--) {
      const reading = readings[i];
      if (isLatLngReading(reading)) {
        return reading.value;
      }
    }
    return undefined;
  }

  /**
   * Get the most recent reading (any type) for a metric
   * Returns the actual BufferedReading object
   */
  getLatestReading(metric: string): BufferedReading | undefined {
    const readings = this.stores.get(metric);
    if (!readings || readings.length === 0) return undefined;
    return readings[readings.length - 1];
  }

  /**
   * Calculate average of recent numeric values
   */
  getAverage(metric: string, seconds?: number): number {
    const values = seconds
      ? this.getRecent(metric, seconds)
      : this.getAll(metric);
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Get maximum numeric value
   */
  getMax(metric: string): number {
    const values = this.getAll(metric);
    if (values.length === 0) return 0;
    return Math.max(...values);
  }

  /**
   * Get minimum numeric value
   */
  getMin(metric: string): number {
    const values = this.getAll(metric);
    if (values.length === 0) return 0;
    return Math.min(...values);
  }

  /**
   * Count readings for a metric (both numeric and lat/lng)
   */
  getCount(metric: string): number {
    return this.stores.get(metric)?.length || 0;
  }

  /**
   * Remove data older than the window size
   * Called every 60 seconds during persistence cycle
   */
  cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    let totalRemoved = 0;
    let totalRemaining = 0;

    for (const [metric, readings] of this.stores.entries()) {
      const beforeCount = readings.length;
      // Find index of first valid reading (could use binary search for optimization)
      const firstValidIndex = readings.findIndex((d) => d.timestamp > cutoff);

      if (firstValidIndex === -1) {
        // All readings are old (or array empty)
        // If array not empty, all are old -> clear
        if (
          readings.length > 0 &&
          readings[readings.length - 1].timestamp <= cutoff
        ) {
          this.stores.set(metric, []);
          totalRemoved += beforeCount;
        } else {
          // Array empty or all valid (findIndex returns -1 if no match, but we need to check if they are all > cutoff or all <= cutoff)
          // Actually findIndex returns -1 if NO element satisfies condition.
          // If no element > cutoff, then ALL are <= cutoff (old).
          // Wait, findIndex returns index of FIRST element that satisfies.
          // If -1, it means NO element is > cutoff. So all are old.
          if (readings.length > 0) {
            this.stores.set(metric, []);
            totalRemoved += beforeCount;
          }
        }
      } else if (firstValidIndex > 0) {
        // Remove old readings
        const newReadings = readings.slice(firstValidIndex);
        this.stores.set(metric, newReadings);
        totalRemoved += firstValidIndex;
        totalRemaining += newReadings.length;
      } else {
        // All readings are valid
        totalRemaining += readings.length;
      }
    }

    if (totalRemoved > 0) {
      console.log(
        `[DataBuffer] Cleaned up ${totalRemoved} old readings (${totalRemaining} remaining)`,
      );
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.stores.clear();
  }

  /**
   * Get buffer statistics
   */
  getStats(): {
    totalReadings: number;
    numericReadings: number;
    latLngReadings: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
    memoryEstimateMB: number;
    metricCounts: Record<string, number>;
  } {
    const metricCounts: Record<string, number> = {};
    let totalReadings = 0;
    let numericCount = 0;
    let latLngCount = 0;
    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (const [metric, readings] of this.stores.entries()) {
      metricCounts[metric] = readings.length;
      totalReadings += readings.length;

      if (readings.length > 0) {
        const first = readings[0];
        const last = readings[readings.length - 1];

        if (oldestTimestamp === null || first.timestamp < oldestTimestamp) {
          oldestTimestamp = first.timestamp;
        }
        if (newestTimestamp === null || last.timestamp > newestTimestamp) {
          newestTimestamp = last.timestamp;
        }

        // Rough count of types (checking first one is approximation but fast)
        if (isNumericReading(first)) {
          numericCount += readings.length;
        } else {
          latLngCount += readings.length;
        }
      }
    }

    return {
      totalReadings,
      numericReadings: numericCount,
      latLngReadings: latLngCount,
      oldestTimestamp,
      newestTimestamp,
      memoryEstimateMB: (totalReadings * 32) / (1024 * 1024), // Rough estimate: 32 bytes per reading
      metricCounts,
    };
  }

  /**
   * Get all readings (useful for debugging or advanced analysis)
   */
  getAllReadings(): BufferedReading[] {
    const all: BufferedReading[] = [];
    for (const readings of this.stores.values()) {
      all.push(...readings);
    }
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get readings by metric (any type)
   */
  getReadingsByMetric(metric: string): BufferedReading[] {
    return this.stores.get(metric) || [];
  }
}
