/**
 * Optimized data structures for high-performance metric calculations
 */

import { RECORDING_CONFIG } from './config';

// === Circular Buffer with Change Tracking ===
export class OptimizedCircularBuffer<T> {
  private buffer: T[] = [];
  private index = 0;
  private full = false;
  private hasChanged = false;
  private lastAccess = 0;

  // Cached calculations to avoid recalculation
  private avgCache?: number;
  private maxCache?: number;
  private minCache?: number;
  private cacheTimestamp = 0;
  private readonly CACHE_DURATION_MS = 100; // Cache for 100ms

  constructor(private capacity: number) {}

  add(item: T): void {
    this.buffer[this.index] = item;
    this.index = (this.index + 1) % this.capacity;
    if (this.index === 0) this.full = true;
    this.hasChanged = true;
    this.invalidateCache();
  }

  hasNewData(): boolean {
    return this.hasChanged;
  }

  markProcessed(): void {
    this.hasChanged = false;
    this.lastAccess = Date.now();
  }

  size(): number {
    return this.full ? this.capacity : this.index;
  }

  isEmpty(): boolean {
    return this.index === 0 && !this.full;
  }

  getValues(): T[] {
    if (this.full) {
      // Return in correct chronological order
      return [
        ...this.buffer.slice(this.index),
        ...this.buffer.slice(0, this.index)
      ];
    }
    return this.buffer.slice(0, this.index);
  }

  // Cached calculations for numeric data
  average(): number {
    if (this.isCacheValid() && this.avgCache !== undefined) {
      return this.avgCache;
    }

    const values = this.getValues() as number[];
    if (values.length === 0) return 0;

    this.avgCache = values.reduce((sum, val) => sum + val, 0) / values.length;
    this.updateCacheTimestamp();
    return this.avgCache;
  }

  max(): number {
    if (this.isCacheValid() && this.maxCache !== undefined) {
      return this.maxCache;
    }

    const values = this.getValues() as number[];
    if (values.length === 0) return 0;

    this.maxCache = Math.max(...values);
    this.updateCacheTimestamp();
    return this.maxCache;
  }

  min(): number {
    if (this.isCacheValid() && this.minCache !== undefined) {
      return this.minCache;
    }

    const values = this.getValues() as number[];
    if (values.length === 0) return 0;

    this.minCache = Math.min(...values);
    this.updateCacheTimestamp();
    return this.minCache;
  }

  latest(): T | undefined {
    if (this.isEmpty()) return undefined;
    const latestIndex = this.index === 0 ? this.capacity - 1 : this.index - 1;
    return this.buffer[latestIndex];
  }

  // Get the nth most recent item (0 = latest, 1 = second latest, etc.)
  nth(n: number): T | undefined {
    if (n >= this.size() || n < 0) return undefined;

    let targetIndex: number;
    if (this.full) {
      targetIndex = (this.index - 1 - n + this.capacity) % this.capacity;
    } else {
      if (n >= this.index) return undefined;
      targetIndex = this.index - 1 - n;
    }

    return this.buffer[targetIndex];
  }

  // Get values from the last N seconds (assuming 1Hz data)
  getRecentValues(seconds: number): T[] {
    const count = Math.min(seconds, this.size());
    const result: T[] = [];

    for (let i = 0; i < count; i++) {
      const item = this.nth(i);
      if (item !== undefined) {
        result.unshift(item); // Insert at beginning for chronological order
      }
    }

    return result;
  }

  private isCacheValid(): boolean {
    return !this.hasChanged &&
           (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION_MS;
  }

  private updateCacheTimestamp(): void {
    this.cacheTimestamp = Date.now();
  }

  private invalidateCache(): void {
    this.avgCache = undefined;
    this.maxCache = undefined;
    this.minCache = undefined;
  }

  // Memory usage estimation
  getMemoryUsage(): number {
    return this.buffer.length * 8; // Rough estimate for numbers
  }

  // Clear all data
  clear(): void {
    this.buffer = [];
    this.index = 0;
    this.full = false;
    this.hasChanged = false;
    this.invalidateCache();
  }
}

// === Running Average Calculator ===
export class RunningAverage {
  private sum = 0;
  private count = 0;
  private _hasData = false;
  private _min = Infinity;
  private _max = -Infinity;

  addValue(value: number): void {
    this.sum += value;
    this.count++;
    this._hasData = true;
    this._min = Math.min(this._min, value);
    this._max = Math.max(this._max, value);
  }

  average(): number {
    return this.count > 0 ? this.sum / this.count : 0;
  }

  hasData(): boolean {
    return this._hasData;
  }

  getCount(): number {
    return this.count;
  }

  getSum(): number {
    return this.sum;
  }

  min(): number {
    return this._hasData ? this._min : 0;
  }

  max(): number {
    return this._hasData ? this._max : 0;
  }

  reset(): void {
    this.sum = 0;
    this.count = 0;
    this._hasData = false;
    this._min = Infinity;
    this._max = -Infinity;
  }

  // Add multiple values efficiently
  addValues(values: number[]): void {
    for (const value of values) {
      this.addValue(value);
    }
  }

  // Get statistics
  getStats(): {
    average: number;
    count: number;
    sum: number;
    min: number;
    max: number;
  } {
    return {
      average: this.average(),
      count: this.count,
      sum: this.sum,
      min: this.min(),
      max: this.max(),
    };
  }
}

// === Zone Time Tracker ===
export class ZoneTimeTracker {
  private zoneTimes: number[] = [];
  private lastZone?: number;
  private lastTimestamp?: number;

  constructor(private numZones: number) {
    this.zoneTimes = new Array(numZones).fill(0);
  }

  updateZone(zone: number, timestamp: number): void {
    // Validate zone
    if (zone < 0 || zone >= this.numZones) {
      return;
    }

    // Add time to previous zone if we have timing data
    if (this.lastZone !== undefined && this.lastTimestamp !== undefined) {
      const deltaMs = timestamp - this.lastTimestamp;
      if (deltaMs > 0 && deltaMs < 60000) { // Sanity check: less than 1 minute
        this.zoneTimes[this.lastZone] += deltaMs;
      }
    }

    this.lastZone = zone;
    this.lastTimestamp = timestamp;
  }

  // Determine zone from value and thresholds
  static getZone(value: number, thresholds: number[]): number {
    for (let i = 0; i < thresholds.length; i++) {
      if (value < thresholds[i]) {
        return i;
      }
    }
    return thresholds.length; // Highest zone
  }

  getZoneTimes(): number[] {
    return [...this.zoneTimes]; // Return copy
  }

  getZoneTimeSeconds(zone: number): number {
    if (zone < 0 || zone >= this.numZones) return 0;
    return Math.floor(this.zoneTimes[zone] / 1000);
  }

  getZoneTimeMinutes(zone: number): number {
    return Math.floor(this.getZoneTimeSeconds(zone) / 60);
  }

  getTotalTime(): number {
    return this.zoneTimes.reduce((sum, time) => sum + time, 0);
  }

  getTotalTimeSeconds(): number {
    return Math.floor(this.getTotalTime() / 1000);
  }

  // Get zone distribution as percentages
  getZoneDistribution(): number[] {
    const total = this.getTotalTime();
    if (total === 0) return new Array(this.numZones).fill(0);

    return this.zoneTimes.map(time => (time / total) * 100);
  }

  reset(): void {
    this.zoneTimes.fill(0);
    this.lastZone = undefined;
    this.lastTimestamp = undefined;
  }

  // Get zone with most time
  getDominantZone(): number {
    let maxTime = 0;
    let dominantZone = 0;

    this.zoneTimes.forEach((time, index) => {
      if (time > maxTime) {
        maxTime = time;
        dominantZone = index;
      }
    });

    return dominantZone;
  }
}

// === Sensor Reading Interface ===
export interface SensorReading {
  metric: string;
  value: number;
  timestamp: number;
  metadata?: {
    deviceId?: string;
    accuracy?: number;
    source?: string;
    batteryLevel?: number;
    signalStrength?: number;
  };
}

// === Location Data Interface ===
export interface LocationData {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
  provider?: string;
}

// === Batch Write Interface ===
export interface BatchWriteData {
  readings: SensorReading[];
  locations: LocationData[];
  timestamp: number;
  activityId?: string;
}

// === Efficient Distance Calculator ===
export class DistanceCalculator {
  private lastLocation?: LocationData;
  private totalDistance = 0;

  // Haversine distance calculation (optimized)
  static haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  addLocation(location: LocationData): number {
    if (!this.lastLocation) {
      this.lastLocation = location;
      return 0;
    }

    const distance = DistanceCalculator.haversineDistance(
      this.lastLocation.latitude,
      this.lastLocation.longitude,
      location.latitude,
      location.longitude
    );

    // Filter out GPS noise
    if (distance > RECORDING_CONFIG.MOVEMENT.DISTANCE_MIN_DELTA_M && distance < 1000) {
      this.totalDistance += distance;
    }

    this.lastLocation = location;
    return distance;
  }

  getTotalDistance(): number {
    return this.totalDistance;
  }

  reset(): void {
    this.lastLocation = undefined;
    this.totalDistance = 0;
  }
}

// === Elevation Tracker ===
export class ElevationTracker {
  private lastElevation?: number;
  private totalAscent = 0;
  private totalDescent = 0;
  private elevationBuffer = new OptimizedCircularBuffer<number>(10); // 10 second smoothing

  addElevation(elevation: number): void {
    // Smooth elevation data
    this.elevationBuffer.add(elevation);
    const smoothedElevation = this.elevationBuffer.average();

    if (this.lastElevation !== undefined) {
      const delta = smoothedElevation - this.lastElevation;

      // Apply threshold to filter GPS noise
      if (Math.abs(delta) > RECORDING_CONFIG.MOVEMENT.ELEVATION_NOISE_THRESHOLD_M) {
        if (delta > 0) {
          this.totalAscent += delta;
        } else {
          this.totalDescent += Math.abs(delta);
        }
      }
    }

    this.lastElevation = smoothedElevation;
  }

  getTotalAscent(): number {
    return this.totalAscent;
  }

  getTotalDescent(): number {
    return this.totalDescent;
  }

  getNetElevation(): number {
    return this.totalAscent - this.totalDescent;
  }

  getCurrentElevation(): number | undefined {
    return this.lastElevation;
  }

  reset(): void {
    this.lastElevation = undefined;
    this.totalAscent = 0;
    this.totalDescent = 0;
    this.elevationBuffer.clear();
  }
}

// === Performance Monitor ===
export class PerformanceMonitor {
  private updateTimes: number[] = [];
  private memoryUsage: number[] = [];
  private calculationTimes: number[] = [];

  recordUpdateTime(duration: number): void {
    this.updateTimes.push(duration);
    if (this.updateTimes.length > 100) {
      this.updateTimes.shift();
    }
  }

  recordMemoryUsage(bytes: number): void {
    this.memoryUsage.push(bytes);
    if (this.memoryUsage.length > 100) {
      this.memoryUsage.shift();
    }
  }

  recordCalculationTime(duration: number): void {
    this.calculationTimes.push(duration);
    if (this.calculationTimes.length > 100) {
      this.calculationTimes.shift();
    }
  }

  getAverageUpdateTime(): number {
    if (this.updateTimes.length === 0) return 0;
    return this.updateTimes.reduce((a, b) => a + b, 0) / this.updateTimes.length;
  }

  getAverageMemoryUsage(): number {
    if (this.memoryUsage.length === 0) return 0;
    return this.memoryUsage.reduce((a, b) => a + b, 0) / this.memoryUsage.length;
  }

  getAverageCalculationTime(): number {
    if (this.calculationTimes.length === 0) return 0;
    return this.calculationTimes.reduce((a, b) => a + b, 0) / this.calculationTimes.length;
  }

  getStats() {
    return {
      avgUpdateTime: this.getAverageUpdateTime(),
      avgMemoryUsage: this.getAverageMemoryUsage(),
      avgCalculationTime: this.getAverageCalculationTime(),
      updateRate: this.updateTimes.length > 0 ? 1000 / this.getAverageUpdateTime() : 0,
    };
  }

  reset(): void {
    this.updateTimes = [];
    this.memoryUsage = [];
    this.calculationTimes = [];
  }
}
