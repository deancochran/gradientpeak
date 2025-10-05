/**
 * DataBuffer - Simple Time-Based Rolling Window
 *
 * Maintains a 60-second window of sensor readings for real-time metric calculations.
 * Automatically removes old data during periodic cleanup.
 */

import { RECORDING_CONFIG } from './config';

export interface BufferedReading {
  metric: string;
  value: number;
  timestamp: number;
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
   * Get recent readings for a specific metric
   * @param metric - The metric name (e.g., "power", "heartrate")
   * @param seconds - How many seconds back to retrieve (default: 30)
   * @returns Array of values
   */
  getRecent(metric: string, seconds: number = 30): number[] {
    const cutoff = Date.now() - seconds * 1000;
    return this.data
      .filter((d) => d.metric === metric && d.timestamp > cutoff)
      .map((d) => d.value);
  }

  /**
   * Get all readings for a specific metric in the entire window
   */
  getAll(metric: string): number[] {
    return this.data.filter((d) => d.metric === metric).map((d) => d.value);
  }

  /**
   * Get the most recent value for a metric
   */
  getLatest(metric: string): number | undefined {
    for (let i = this.data.length - 1; i >= 0; i--) {
      if (this.data[i].metric === metric) {
        return this.data[i].value;
      }
    }
    return undefined;
  }

  /**
   * Calculate average of recent values
   */
  getAverage(metric: string, seconds?: number): number {
    const values = seconds
      ? this.getRecent(metric, seconds)
      : this.getAll(metric);
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Get maximum value
   */
  getMax(metric: string): number {
    const values = this.getAll(metric);
    if (values.length === 0) return 0;
    return Math.max(...values);
  }

  /**
   * Get minimum value
   */
  getMin(metric: string): number {
    const values = this.getAll(metric);
    if (values.length === 0) return 0;
    return Math.min(...values);
  }

  /**
   * Count readings for a metric
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
    this.data = this.data.filter((d) => d.timestamp > cutoff);
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
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
    memoryEstimateMB: number;
  } {
    return {
      totalReadings: this.data.length,
      oldestTimestamp: this.data[0]?.timestamp ?? null,
      newestTimestamp: this.data[this.data.length - 1]?.timestamp ?? null,
      memoryEstimateMB: (this.data.length * 24) / (1024 * 1024), // Rough estimate
    };
  }
}
