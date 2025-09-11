import type {
  PowerCurvePoint,
  PowerHeartRatePoint,
  TrainingLoadTrendPoint,
  TrendsActivity,
  TrendsTimeFrame,
  ZoneDistributionPoint,
} from "@repo/core";
import {
  calculateHeartRateZoneDistribution,
  calculatePowerCurve,
  calculatePowerHeartRateTrend,
  calculatePowerZoneDistribution,
  calculateTrainingLoadProgression,
  validateTrendsData,
} from "@repo/core";
import * as FileSystem from "expo-file-system";
import type { SelectLocalActivity } from "../db/schemas";
import { ActivityService } from "./activity-service";
import { LocalActivityDatabaseService } from "./local-activity-database";

export interface TrendsDataOptions {
  timeFrame: TrendsTimeFrame;
  profileId: string;
  ftp?: number;
  maxHR?: number;
  thresholdHR?: number;
}

export interface TrendsData {
  trainingLoad: TrainingLoadTrendPoint[];
  powerZones: ZoneDistributionPoint[];
  heartRateZones: ZoneDistributionPoint[];
  powerHeartRate: PowerHeartRatePoint[];
  powerCurve: PowerCurvePoint[];
  validation: {
    hasTrainingLoad: boolean;
    hasPowerZones: boolean;
    hasHeartRateZones: boolean;
    hasPowerHeartRate: boolean;
    hasPowerCurve: boolean;
    activityCount: number;
    dateRange: { start: Date | null; end: Date | null };
  };
}

/**
 * Service for aggregating and calculating trends data from completed activities
 */
export class TrendsService {
  private static initialized = false;

  /**
   * Initialize trends service
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await ActivityService.initialize();
      this.initialized = true;
      console.log("📊 Trends service initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize trends service:", error);
      throw error;
    }
  }

  /**
   * Load activity data for trends analysis
   */
  static async loadActivitiesForTrends(
    profileId: string,
    timeFrame: TrendsTimeFrame,
  ): Promise<TrendsActivity[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const activities =
      await LocalActivityDatabaseService.getActivitiesForProfile(profileId);

    // Filter to synced activities only (have real data)
    const syncedActivities = activities.filter(
      (a) => a.syncStatus === "synced" && a.cloudStoragePath,
    );

    console.log(
      `📊 Found ${syncedActivities.length} synced activities for trends analysis`,
    );

    const trendsActivities: TrendsActivity[] = [];

    for (const activity of syncedActivities) {
      try {
        const trendsActivity = await this.convertToTrendsActivity(activity);
        if (trendsActivity) {
          trendsActivities.push(trendsActivity);
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to load activity data for ${activity.id}:`,
          error,
        );
      }
    }

    // Sort by date and filter by timeframe
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeFrame.days);

    return trendsActivities
      .filter((a) => a.date >= cutoffDate)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Convert local activity record to trends activity format
   */
  private static async convertToTrendsActivity(
    activity: SelectLocalActivity,
  ): Promise<TrendsActivity | null> {
    try {
      // Load JSON data if available
      let activityData = null;
      if (activity.localStoragePath) {
        const fileInfo = await FileSystem.getInfoAsync(
          activity.localStoragePath,
        );
        if (fileInfo.exists) {
          const jsonContent = await FileSystem.readAsStringAsync(
            activity.localStoragePath,
          );
          activityData = JSON.parse(jsonContent);
        }
      }

      // Load cached metadata if available
      let metadata = null;
      if (activity.cached_metadata) {
        try {
          metadata = JSON.parse(activity.cached_metadata);
        } catch (error) {
          console.warn("Failed to parse cached metadata:", error);
        }
      }

      const trendsActivity: TrendsActivity = {
        id: activity.id,
        date: new Date(activity.startDate),
        activityType: activity.activityType,
        duration: activity.totalTime || 0,
        tss: activity.tss || undefined,
        avgHeartRate: activity.avgHeartRate || undefined,
        maxHeartRate: activity.maxHeartRate || undefined,
        avgPower: activity.avgPower || undefined,
        maxPower: activity.maxPower || undefined,
      };

      // Add detailed data if available from JSON
      if (activityData) {
        if (activityData.streams) {
          trendsActivity.dataStreams = activityData.streams;
        }
        if (activityData.dataPoints) {
          trendsActivity.dataPoints = activityData.dataPoints;
        }
        if (activityData.summary) {
          trendsActivity.normalizedPower = activityData.summary.normalizedPower;
        }
      }

      // Enhance from metadata
      if (metadata) {
        trendsActivity.tss = trendsActivity.tss || metadata.tss;
        trendsActivity.avgHeartRate =
          trendsActivity.avgHeartRate || metadata.avgHeartRate;
        trendsActivity.avgPower = trendsActivity.avgPower || metadata.avgPower;
        trendsActivity.normalizedPower =
          trendsActivity.normalizedPower || metadata.normalizedPower;
      }

      return trendsActivity;
    } catch (error) {
      console.error(`Failed to convert activity ${activity.id}:`, error);
      return null;
    }
  }

  /**
   * Calculate all trends data for the given options
   */
  static async calculateTrends(
    options: TrendsDataOptions,
  ): Promise<TrendsData> {
    const activities = await this.loadActivitiesForTrends(
      options.profileId,
      options.timeFrame,
    );

    console.log(
      `📊 Calculating trends for ${activities.length} activities over ${options.timeFrame.days} days`,
    );

    // Validate data availability
    const validation = validateTrendsData(activities);

    // Calculate all trend types
    const trainingLoad = validation.hasTrainingLoad
      ? calculateTrainingLoadProgression(activities, options.timeFrame)
      : [];

    const powerZones =
      validation.hasPowerZones && options.ftp
        ? calculatePowerZoneDistribution(
            activities,
            options.ftp,
            options.timeFrame,
          )
        : [];

    const heartRateZones =
      validation.hasHeartRateZones && options.maxHR && options.thresholdHR
        ? calculateHeartRateZoneDistribution(
            activities,
            options.maxHR,
            options.thresholdHR,
            options.timeFrame,
          )
        : [];

    const powerHeartRate = validation.hasPowerHeartRate
      ? calculatePowerHeartRateTrend(activities, options.timeFrame)
      : [];

    const powerCurve = validation.hasPowerCurve
      ? calculatePowerCurve(activities)
      : [];

    console.log("📊 Trends calculation complete:", {
      trainingLoadPoints: trainingLoad.length,
      powerZonePoints: powerZones.length,
      hrZonePoints: heartRateZones.length,
      powerHRPoints: powerHeartRate.length,
      powerCurvePoints: powerCurve.length,
    });

    return {
      trainingLoad,
      powerZones,
      heartRateZones,
      powerHeartRate,
      powerCurve,
      validation,
    };
  }

  /**
   * Get time frame configurations for different periods
   */
  static getTimeFrameConfig(
    period: "7d" | "30d" | "90d" | "1y",
  ): TrendsTimeFrame {
    switch (period) {
      case "7d":
        return { days: 7, sampleRate: 1 }; // Show all days
      case "30d":
        return { days: 30, sampleRate: 1 }; // Show all days
      case "90d":
        return { days: 90, sampleRate: 3 }; // Show every 3rd day
      case "1y":
        return { days: 365, sampleRate: 7 }; // Show weekly
      default:
        return { days: 30, sampleRate: 1 };
    }
  }

  /**
   * Check if there's sufficient data for meaningful trends
   */
  static async checkDataAvailability(
    profileId: string,
    minActivities: number = 5,
  ): Promise<{
    hasData: boolean;
    activityCount: number;
    syncedCount: number;
    recommendation: string;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const activities =
      await LocalActivityDatabaseService.getActivitiesForProfile(profileId);

    const syncedActivities = activities.filter(
      (a) => a.syncStatus === "synced" && a.cloudStoragePath,
    );

    const hasData = syncedActivities.length >= minActivities;
    let recommendation = "";

    if (syncedActivities.length === 0) {
      recommendation =
        "No completed activities found. Start recording activities to see trends.";
    } else if (syncedActivities.length < minActivities) {
      recommendation = `You need at least ${minActivities} completed activities for meaningful trends. You have ${syncedActivities.length}.`;
    } else {
      recommendation = "You have enough data to view trends and insights.";
    }

    return {
      hasData,
      activityCount: activities.length,
      syncedCount: syncedActivities.length,
      recommendation,
    };
  }

  /**
   * Get sample data for testing when no real activities exist
   */
  static getSampleTrendsData(timeFrame: TrendsTimeFrame): TrendsData {
    console.log("📊 Generating sample trends data for testing");

    const now = new Date();
    const sampleData: TrendsData = {
      trainingLoad: [],
      powerZones: [],
      heartRateZones: [],
      powerHeartRate: [],
      powerCurve: [],
      validation: {
        hasTrainingLoad: false,
        hasPowerZones: false,
        hasHeartRateZones: false,
        hasPowerHeartRate: false,
        hasPowerCurve: false,
        activityCount: 0,
        dateRange: { start: null, end: null },
      },
    };

    // Generate sample training load data
    for (let i = 0; i < timeFrame.days; i += timeFrame.sampleRate) {
      const date = new Date(now);
      date.setDate(date.getDate() - (timeFrame.days - i));

      const ctl = 40 + Math.sin(i / 10) * 15 + i * 0.3;
      const atl = 35 + Math.sin(i / 5) * 20 + i * 0.2;
      const dailyTSS = Math.max(0, 50 + Math.sin(i / 3) * 40);

      sampleData.trainingLoad.push({
        date,
        ctl: Math.max(0, ctl),
        atl: Math.max(0, atl),
        tsb: ctl - atl,
        dailyTSS,
      });
    }

    return sampleData;
  }
}
