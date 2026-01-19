/**
 * RollingBuffer - Time-windowed data buffer for smoothing
 *
 * Maintains a buffer of timestamped samples and provides access
 * to samples within a specified time window.
 */

export interface BufferSample<T> {
  value: T;
  timestamp: number;
}

export class RollingBuffer<T> {
  private samples: BufferSample<T>[] = [];
  private maxSamples: number;

  constructor(maxSamples: number = 100) {
    this.maxSamples = maxSamples;
  }

  /**
   * Add a new sample to the buffer
   */
  add(value: T, timestamp: number): void {
    this.samples.push({ value, timestamp });

    // Keep buffer size manageable
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /**
   * Get all samples within the specified time window (in milliseconds)
   * Returns samples from (now - windowMs) to now
   */
  getSamples(windowMs: number): BufferSample<T>[] {
    if (this.samples.length === 0) return [];

    const now = this.samples[this.samples.length - 1].timestamp;
    const cutoff = now - windowMs;

    return this.samples.filter((sample) => sample.timestamp >= cutoff);
  }

  /**
   * Get the most recent sample
   */
  getLatest(): BufferSample<T> | undefined {
    return this.samples[this.samples.length - 1];
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.samples.length === 0;
  }

  /**
   * Clear all samples
   */
  clear(): void {
    this.samples = [];
  }

  /**
   * Get total number of samples in buffer
   */
  size(): number {
    return this.samples.length;
  }
}
