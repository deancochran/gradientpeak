import type {
  ActivityDataPoint,
  ActivityStream,
  TSSHistoryEntry,
} from "../types";
import { calculateHrZones, calculateTimeInZones } from "./hr";
import { calculatePowerZones, calculateTimeInPowerZones } from "./power";
import { addDays, endOfDay, startOfDay } from "./utils";

export interface TrendsActivity {
  id: string;
  date: Date;
  activityType: string;
  duration: number; // seconds
  tss?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPower?: number;
  maxPower?: number;
  normalizedPower?: number;
  dataStreams?: ActivityStream[];
  dataPoints?: ActivityDataPoint[];
}

export interface TrendsTimeFrame {
  days: number;
  sampleRate: number; // Show every nth day
}

export interface TrainingLoadTrendPoint {
  date: Date;
  ctl: number;
  atl: number;
  tsb: number;
  dailyTSS: number;
}

export interface ZoneDistributionPoint {
  date: Date;
  z1: number; // time in seconds
  z2: number;
  z3: number;
  z4: number;
  z5: number;
  z6?: number;
  z7?: number;
}

export interface PowerHeartRatePoint {
  power: number; // watts (5W buckets)
  heartRate: number; // bpm
  count: number; // number of data points
  date: Date;
}

export interface PowerCurvePoint {
  duration: number; // seconds
  power: number; // watts
  date: Date; // when this best effort was achieved
}

/**
 * Calculate training load progression over time
 */
export function calculateTrainingLoadProgression(
  activities: TrendsActivity[],
  timeFrame: TrendsTimeFrame,
): TrainingLoadTrendPoint[] {
  if (activities.length === 0) return [];

  const sortedActivities = activities
    .filter((a) => a.tss !== undefined && a.tss > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sortedActivities.length === 0) return [];

  const endDate = new Date();
  const startDate = addDays(endDate, -timeFrame.days);

  // Create TSS history entries
  const tssHistory: TSSHistoryEntry[] = [];
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayActivities = sortedActivities.filter(
      (a) =>
        a.date >= startOfDay(currentDate) && a.date <= endOfDay(currentDate),
    );

    const dailyTSS = dayActivities.reduce((sum, a) => sum + (a.tss || 0), 0);

    if (dailyTSS > 0 || tssHistory.length > 0) {
      tssHistory.push({
        date: new Date(currentDate),
        tss: dailyTSS,
      });
    }

    currentDate = addDays(currentDate, 1);
  }

  // Calculate progressive training load
  const progression: TrainingLoadTrendPoint[] = [];
  let ctl = 0;
  let atl = 0;

  const ctlAlpha = 2 / (42 + 1); // 42-day exponential moving average
  const atlAlpha = 2 / (7 + 1); // 7-day exponential moving average

  for (const entry of tssHistory) {
    ctl = entry.tss * ctlAlpha + ctl * (1 - ctlAlpha);
    atl = entry.tss * atlAlpha + atl * (1 - atlAlpha);
    const tsb = ctl - atl;

    progression.push({
      date: entry.date,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      dailyTSS: entry.tss,
    });
  }

  // Sample data according to timeFrame.sampleRate
  return progression.filter((_, index) => index % timeFrame.sampleRate === 0);
}

/**
 * Calculate power zone distribution over time
 */
export function calculatePowerZoneDistribution(
  activities: TrendsActivity[],
  ftp: number,
  timeFrame: TrendsTimeFrame,
): ZoneDistributionPoint[] {
  if (!ftp || ftp <= 0 || activities.length === 0) return [];

  const powerZones = calculatePowerZones(ftp);
  const sortedActivities = activities
    .filter((a) => a.activityType === "bike" && a.dataStreams)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sortedActivities.length === 0) return [];

  const endDate = new Date();
  const startDate = addDays(endDate, -timeFrame.days);
  const distribution: ZoneDistributionPoint[] = [];

  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dayActivities = sortedActivities.filter(
      (a) =>
        a.date >= startOfDay(currentDate) && a.date <= endOfDay(currentDate),
    );

    let z1 = 0,
      z2 = 0,
      z3 = 0,
      z4 = 0,
      z5 = 0,
      z6 = 0,
      z7 = 0;

    for (const activity of dayActivities) {
      const powerStream = activity.dataStreams?.find((s) => s.type === "power");
      if (powerStream && Array.isArray(powerStream.data)) {
        const powerData = powerStream.data as number[];
        const timeInZones = calculateTimeInPowerZones(powerData, powerZones);
        z1 += timeInZones.zone1 || 0;
        z2 += timeInZones.zone2 || 0;
        z3 += timeInZones.zone3 || 0;
        z4 += timeInZones.zone4 || 0;
        z5 += timeInZones.zone5 || 0;
        z6 += 0; // Zone 6 not supported by current power zones
        z7 += 0; // Zone 7 not supported by current power zones
      }
    }

    // Only add points where there's actual data
    if (z1 + z2 + z3 + z4 + z5 + z6 + z7 > 0) {
      distribution.push({
        date: new Date(currentDate),
        z1,
        z2,
        z3,
        z4,
        z5,
        z6,
        z7,
      });
    }

    currentDate = addDays(currentDate, 1);
  }

  // Sample according to timeFrame.sampleRate
  return distribution.filter((_, index) => index % timeFrame.sampleRate === 0);
}

/**
 * Calculate heart rate zone distribution over time
 */
export function calculateHeartRateZoneDistribution(
  activities: TrendsActivity[],
  maxHR: number,
  thresholdHR: number,
  timeFrame: TrendsTimeFrame,
): ZoneDistributionPoint[] {
  if (!maxHR || !thresholdHR || activities.length === 0) return [];

  const hrZones = calculateHrZones(thresholdHR);
  const sortedActivities = activities
    .filter((a) => a.dataStreams)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sortedActivities.length === 0) return [];

  const endDate = new Date();
  const startDate = addDays(endDate, -timeFrame.days);
  const distribution: ZoneDistributionPoint[] = [];

  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dayActivities = sortedActivities.filter(
      (a) =>
        a.date >= startOfDay(currentDate) && a.date <= endOfDay(currentDate),
    );

    let z1 = 0,
      z2 = 0,
      z3 = 0,
      z4 = 0,
      z5 = 0;

    for (const activity of dayActivities) {
      const hrStream = activity.dataStreams?.find(
        (s) => s.type === "heartrate",
      );
      if (hrStream && Array.isArray(hrStream.data)) {
        const hrData = hrStream.data as number[];
        const timeInZones = calculateTimeInZones(hrData, hrZones);
        z1 += timeInZones.zone1 || 0;
        z2 += timeInZones.zone2 || 0;
        z3 += timeInZones.zone3 || 0;
        z4 += timeInZones.zone4 || 0;
        z5 += timeInZones.zone5 || 0;
      }
    }

    // Only add points where there's actual data
    if (z1 + z2 + z3 + z4 + z5 > 0) {
      distribution.push({
        date: new Date(currentDate),
        z1: z1,
        z2: z2,
        z3: z3,
        z4: z4,
        z5: z5,
      });
    }

    currentDate = addDays(currentDate, 1);
  }

  return distribution.filter((_, index) => index % timeFrame.sampleRate === 0);
}

/**
 * Calculate power vs heart rate trend data
 */
export function calculatePowerHeartRateTrend(
  activities: TrendsActivity[],
  timeFrame: TrendsTimeFrame,
): PowerHeartRatePoint[] {
  const sortedActivities = activities
    .filter((a) => a.activityType === "bike" && a.dataPoints)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sortedActivities.length === 0) return [];

  const powerHRData: PowerHeartRatePoint[] = [];

  for (const activity of sortedActivities) {
    if (!activity.dataPoints) continue;

    // Group data points by 5W power buckets
    const buckets = new Map<number, { hrSum: number; count: number }>();

    for (const point of activity.dataPoints) {
      if (
        point.power &&
        point.heartRate &&
        point.power > 0 &&
        point.heartRate > 0
      ) {
        const powerBucket = Math.floor(point.power / 5) * 5; // 5W buckets

        if (!buckets.has(powerBucket)) {
          buckets.set(powerBucket, { hrSum: 0, count: 0 });
        }

        const bucket = buckets.get(powerBucket)!;
        bucket.hrSum += point.heartRate;
        bucket.count += 1;
      }
    }

    // Convert buckets to trend points
    for (const [power, data] of buckets) {
      if (data.count >= 5) {
        // Minimum 5 data points for reliability
        powerHRData.push({
          power,
          heartRate: Math.round(data.hrSum / data.count),
          count: data.count,
          date: activity.date,
        });
      }
    }
  }

  return powerHRData;
}

/**
 * Calculate power curve (best efforts) over time
 */
export function calculatePowerCurve(
  activities: TrendsActivity[],
  durations: number[] = [5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600], // seconds
): PowerCurvePoint[] {
  const bikeActivities = activities
    .filter((a) => a.activityType === "bike" && a.dataStreams)
    .sort((a, b) => b.date.getTime() - a.date.getTime()); // Most recent first

  if (bikeActivities.length === 0) return [];

  const bestEfforts = new Map<number, PowerCurvePoint>();

  for (const activity of bikeActivities) {
    const powerStream = activity.dataStreams?.find((s) => s.type === "power");
    if (!powerStream || !Array.isArray(powerStream.data)) continue;

    const powerData = powerStream.data as number[];

    for (const duration of durations) {
      const windowSize = duration; // Assuming 1Hz data
      if (powerData.length < windowSize) continue;

      let maxPower = 0;

      // Calculate rolling average for each window
      for (let i = 0; i <= powerData.length - windowSize; i++) {
        const windowData = powerData.slice(i, i + windowSize);
        const avgPower = windowData.reduce((sum, p) => sum + p, 0) / windowSize;

        if (avgPower > maxPower) {
          maxPower = avgPower;
        }
      }

      // Only update if this is a new best or we don't have data for this duration
      const existing = bestEfforts.get(duration);
      if (!existing || maxPower > existing.power) {
        bestEfforts.set(duration, {
          duration,
          power: Math.round(maxPower),
          date: activity.date,
        });
      }
    }
  }

  return Array.from(bestEfforts.values()).sort(
    (a, b) => a.duration - b.duration,
  );
}

/**
 * Check if activities have sufficient data for trends analysis
 */
export function validateTrendsData(activities: TrendsActivity[]): {
  hasTrainingLoad: boolean;
  hasPowerZones: boolean;
  hasHeartRateZones: boolean;
  hasPowerHeartRate: boolean;
  hasPowerCurve: boolean;
  activityCount: number;
  dateRange: { start: Date | null; end: Date | null };
} {
  const activityCount = activities.length;
  const sortedActivities = activities.sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  const dateRange = {
    start: sortedActivities.length > 0 ? sortedActivities[0].date : null,
    end:
      sortedActivities.length > 0
        ? sortedActivities[sortedActivities.length - 1].date
        : null,
  };

  return {
    hasTrainingLoad: activities.some((a) => a.tss !== undefined && a.tss > 0),
    hasPowerZones: activities.some(
      (a) =>
        a.activityType === "bike" &&
        a.dataStreams?.some((s) => s.type === "power"),
    ),
    hasHeartRateZones: activities.some(
      (a) =>
        a.dataStreams?.some((s) => s.type === "heartrate") ||
        (a.avgHeartRate !== undefined && a.avgHeartRate > 0),
    ),
    hasPowerHeartRate: activities.some(
      (a) =>
        a.activityType === "bike" &&
        a.dataPoints?.some(
          (p) => p.power !== undefined && p.heartRate !== undefined,
        ),
    ),
    hasPowerCurve: activities.some(
      (a) =>
        a.activityType === "bike" &&
        a.dataStreams?.some((s) => s.type === "power"),
    ),
    activityCount,
    dateRange,
  };
}
