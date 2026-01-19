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
  private data: BufferedReading[] = [];
  private windowMs: number;

  constructor(windowSeconds: number = RECORDING_CONFIG.BUFFER_WINDOW_SECONDS) {
    this.windowMs = windowSeconds * 1000;
  }

  /**
   * Add a sensor reading to the buffer
   */
  add(reading: BufferedReading): void {
    this.data.push(reading);
  }

  /**
   * Get recent numeric readings for a specific metric
   * @param metric - The metric name (e.g., "power", "heartrate")
   * @param seconds - How many seconds back to retrieve (default: 30)
   * @returns Array of numeric values
   */
  getRecent(metric: string, seconds: number = 30): number[] {
    const cutoff = Date.now() - seconds * 1000;
    return this.data
      .filter(
        (d): d is NumericBufferedReading =>
          d.metric === metric && d.timestamp > cutoff && isNumericReading(d),
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
    const cutoff = Date.now() - seconds * 1000;
    return this.data
      .filter(
        (d): d is LatLngBufferedReading =>
          d.metric === metric && d.timestamp > cutoff && isLatLngReading(d),
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
    const cutoff = Date.now() - seconds * 1000;
    return this.data.filter(
      (d) => d.metric === metric && d.timestamp > cutoff
    );
  }

  /**
   * Get all numeric readings for a specific metric in the entire window
   */
  getAll(metric: string): number[] {
    return this.data
      .filter(
        (d): d is NumericBufferedReading =>
          d.metric === metric && isNumericReading(d),
      )
      .map((d) => d.value);
  }

  /**
   * Get all lat/lng readings for a specific metric in the entire window
   */
  getAllLatLng(metric: string): [number, number][] {
    return this.data
      .filter(
        (d): d is LatLngBufferedReading =>
          d.metric === metric && isLatLngReading(d),
      )
      .map((d) => d.value);
  }

  /**
   * Get the most recent value for a metric
   * Returns number for numeric metrics, undefined for non-numeric
   */
  getLatest(metric: string): number | undefined {
    for (let i = this.data.length - 1; i >= 0; i--) {
      const reading = this.data[i];
      if (reading.metric === metric && isNumericReading(reading)) {
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
    for (let i = this.data.length - 1; i >= 0; i--) {
      const reading = this.data[i];
      if (reading.metric === metric && isLatLngReading(reading)) {
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
    for (let i = this.data.length - 1; i >= 0; i--) {
      if (this.data[i].metric === metric) {
        return this.data[i];
      }
    }
    return undefined;
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
    return this.data.filter((d) => d.metric === metric).length;
  }

  /**
   * Remove data older than the window size
   * Called every 60 seconds during persistence cycle
   */
  cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    const beforeCount = this.data.length;
    this.data = this.data.filter((d) => d.timestamp > cutoff);
    const removedCount = beforeCount - this.data.length;

    if (removedCount > 0) {
      console.log(
        `[DataBuffer] Cleaned up ${removedCount} old readings (${this.data.length} remaining)`,
      );
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data = [];
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
    let numericCount = 0;
    let latLngCount = 0;

    for (const reading of this.data) {
      metricCounts[reading.metric] = (metricCounts[reading.metric] || 0) + 1;
      if (isNumericReading(reading)) {
        numericCount++;
      } else {
        latLngCount++;
      }
    }

    return {
      totalReadings: this.data.length,
      numericReadings: numericCount,
      latLngReadings: latLngCount,
      oldestTimestamp: this.data[0]?.timestamp ?? null,
      newestTimestamp: this.data[this.data.length - 1]?.timestamp ?? null,
      memoryEstimateMB: (this.data.length * 32) / (1024 * 1024), // Rough estimate: 32 bytes per reading
      metricCounts,
    };
  }

  /**
   * Get all readings (useful for debugging or advanced analysis)
   */
  getAllReadings(): BufferedReading[] {
    return [...this.data];
  }

  /**
   * Get readings by metric (any type)
   */
  getReadingsByMetric(metric: string): BufferedReading[] {
    return this.data.filter((d) => d.metric === metric);
  }
}
