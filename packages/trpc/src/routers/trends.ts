import {
  calculateATL,
  calculateCTL,
  calculateTSB,
  getFormStatus,
  getTrainingIntensityZone,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Input schemas
const dateRangeSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
});

const volumeTrendsSchema = dateRangeSchema.extend({
  groupBy: z.enum(["day", "week", "month"]).default("week"),
  type: z.enum(["run", "bike", "swim", "strength", "other"]).optional(),
});

const performanceTrendsSchema = dateRangeSchema.extend({
  type: z.enum(["run", "bike", "swim", "strength", "other"]).optional(),
});

const zoneDistributionTrendsSchema = dateRangeSchema.extend({
  metric: z.enum(["power", "heartrate"]).default("power"),
});

const peakPerformancesSchema = z.object({
  type: z.enum(["run", "bike", "swim", "strength", "other"]).optional(),
  metric: z.enum(["distance", "speed", "power", "duration", "tss"]),
  limit: z.number().min(1).max(50).default(10),
});

export const trendsRouter = createTRPCRouter({
  // ------------------------------
  // Volume Trends - Distance, Time, Activity Count
  // ------------------------------
  getVolumeTrends: protectedProcedure
    .input(volumeTrendsSchema)
    .query(async ({ ctx, input }) => {
      // Build query
      let query = ctx.supabase
        .from("activities")
        .select(
          "started_at, distance_meters, moving_seconds, duration_seconds, type",
        )
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .order("started_at", { ascending: true });

      // Filter by category if provided
      if (input.type) {
        query = query.eq("type", input.type);
      }

      const { data: activities, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      if (!activities || activities.length === 0) {
        return { dataPoints: [], totals: null };
      }

      // Group activities by time period
      const groupedData = new Map<
        string,
        {
          date: string;
          totalDistance: number;
          totalTime: number;
          activityCount: number;
        }
      >();

      for (const activity of activities) {
        const date = new Date(activity.started_at);
        let groupKey: string;

        switch (input.groupBy) {
          case "day":
            groupKey = date.toISOString().split("T")[0] || "";
            break;
          case "week": {
            // Get Monday of the week
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay() + 1);
            groupKey = weekStart.toISOString().split("T")[0] || "";
            break;
          }
          case "month":
            groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
            break;
        }

        if (!groupedData.has(groupKey)) {
          groupedData.set(groupKey, {
            date: groupKey,
            totalDistance: 0,
            totalTime: 0,
            activityCount: 0,
          });
        }

        const group = groupedData.get(groupKey)!;
        group.totalDistance += activity.distance_meters || 0;
        group.totalTime +=
          activity.moving_seconds || activity.duration_seconds || 0;
        group.activityCount += 1;
      }

      // Convert to array and sort
      const dataPoints = Array.from(groupedData.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      // Calculate totals
      const totals = {
        totalDistance: activities.reduce(
          (sum, a) => sum + (a.distance_meters || 0),
          0,
        ),
        totalTime: activities.reduce(
          (sum, a) => sum + (a.moving_seconds || a.duration_seconds || 0),
          0,
        ),
        totalActivities: activities.length,
      };

      return { dataPoints, totals };
    }),

  // ------------------------------
  // Performance Trends - Speed, Power, HR over time
  // ------------------------------
  getPerformanceTrends: protectedProcedure
    .input(performanceTrendsSchema)
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("activities")
        .select(
          "id, name, started_at, distance_meters, moving_seconds, metrics, type",
        )
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .order("started_at", { ascending: true });

      if (input.type) {
        query = query.eq("type", input.type);
      }

      const { data: activities, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      if (!activities || activities.length === 0) {
        return { dataPoints: [] };
      }

      const dataPoints = activities.map((activity) => {
        const metrics = (activity.metrics as Record<string, any>) || {};
        return {
          date: activity.started_at,
          activityId: activity.id,
          activityName: activity.name,
          avgSpeed: metrics.avg_speed || null,
          avgPower: metrics.avg_power || null,
          avgHeartRate: metrics.avg_heart_rate || null,
          distance: activity.distance_meters || 0,
          duration: activity.moving_seconds || 0,
        };
      });

      return { dataPoints };
    }),

  // ------------------------------
  // Training Load Trends (works WITHOUT training plan)
  // ------------------------------
  getTrainingLoadTrends: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const startDate = new Date(input.start_date);
      const endDate = new Date(input.end_date);

      // Get all activities in the date range plus 42 days before (for CTL calculation)
      const extendedStart = new Date(startDate);
      extendedStart.setDate(startDate.getDate() - 42);

      const { data: activities, error: activitiesError } = await ctx.supabase
        .from("activities")
        .select("started_at, metrics")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", extendedStart.toISOString())
        .lte("started_at", endDate.toISOString())
        .order("started_at", { ascending: true });

      if (activitiesError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: activitiesError.message,
        });
      }

      if (!activities || activities.length === 0) {
        return { dataPoints: [], currentStatus: null };
      }

      // Calculate CTL/ATL/TSB for each day
      const tssData: { date: string; tss: number }[] = [];
      const activitiesByDate = new Map<string, number>();

      // Group activities by date and sum TSS
      for (const activity of activities) {
        const dateStr = new Date(activity.started_at)
          .toISOString()
          .split("T")[0];
        if (!dateStr) continue;
        const metrics = (activity.metrics as Record<string, any>) || {};
        const tss = metrics.tss || 0;
        activitiesByDate.set(
          dateStr,
          (activitiesByDate.get(dateStr) || 0) + tss,
        );
      }

      // Create daily TSS array
      const daysDiff = Math.floor(
        (endDate.getTime() - extendedStart.getTime()) / (1000 * 60 * 60 * 24),
      );

      let currentCTL = 0;
      let currentATL = 0;

      for (let i = 0; i <= daysDiff; i++) {
        const date = new Date(extendedStart.getTime());
        date.setDate(extendedStart.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];
        if (!dateStr) continue;

        const tss = activitiesByDate.get(dateStr) || 0;
        currentCTL = calculateCTL(currentCTL, tss);
        currentATL = calculateATL(currentATL, tss);
        const tsb = calculateTSB(currentCTL, currentATL);

        tssData.push({ date: dateStr, tss });

        // Only include in results if within requested range
        if (date >= startDate && date <= endDate) {
          // Skip entries (keep logic simple)
        }
      }

      // Filter to requested date range and create data points
      const dataPoints = [];
      let finalCTL = 0;
      let finalATL = 0;
      let finalTSB = 0;

      currentCTL = 0;
      currentATL = 0;

      for (const item of tssData) {
        const date = new Date(item.date);
        currentCTL = calculateCTL(currentCTL, item.tss);
        currentATL = calculateATL(currentATL, item.tss);
        const tsb = calculateTSB(currentCTL, currentATL);

        if (date >= startDate && date <= endDate) {
          dataPoints.push({
            date: item.date,
            ctl: Math.round(currentCTL * 10) / 10,
            atl: Math.round(currentATL * 10) / 10,
            tsb: Math.round(tsb * 10) / 10,
            tss: item.tss,
          });

          finalCTL = currentCTL;
          finalATL = currentATL;
          finalTSB = tsb;
        }
      }

      // Current status
      const currentStatus =
        dataPoints.length > 0
          ? {
              ctl: Math.round(finalCTL * 10) / 10,
              atl: Math.round(finalATL * 10) / 10,
              tsb: Math.round(finalTSB * 10) / 10,
              form: getFormStatus(finalTSB),
            }
          : null;

      return { dataPoints, currentStatus };
    }),

  // ------------------------------
  // Zone Distribution Over Time
  // ------------------------------
  getZoneDistributionTrends: protectedProcedure
    .input(zoneDistributionTrendsSchema)
    .query(async ({ ctx, input }) => {
      const startDate = new Date(input.start_date);
      const endDate = new Date(input.end_date);

      // Get activities with intensity factor and TSS
      const { data: activities, error } = await ctx.supabase
        .from("activities")
        .select("id, started_at, metrics")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .order("started_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      if (!activities || activities.length === 0) {
        return { weeklyData: [] };
      }

      // Group by week
      type IntensityZone =
        | "recovery"
        | "endurance"
        | "tempo"
        | "threshold"
        | "vo2max"
        | "anaerobic"
        | "neuromuscular";

      const weeklyData = new Map<
        string,
        {
          weekStart: string;
          totalTSS: number;
          zones: Record<IntensityZone, number>;
        }
      >();

      for (const activity of activities) {
        const metrics = (activity.metrics as Record<string, any>) || {};
        const intensityFactor = metrics.if || null;
        const tss = metrics.tss || null;

        // Skip activities without both IF and TSS
        if (!intensityFactor || !tss) continue;

        const date = new Date(activity.started_at);
        // Get Monday of the week
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay() + 1);
        const weekKey = weekStart.toISOString().split("T")[0] || "";

        if (!weeklyData.has(weekKey)) {
          weeklyData.set(weekKey, {
            weekStart: weekKey,
            totalTSS: 0,
            zones: {
              recovery: 0,
              endurance: 0,
              tempo: 0,
              threshold: 0,
              vo2max: 0,
              anaerobic: 0,
              neuromuscular: 0,
            },
          });
        }

        const week = weeklyData.get(weekKey)!;
        const intensityFactorNormalized = intensityFactor / 100;

        const zone = getTrainingIntensityZone(
          intensityFactorNormalized,
        ) as IntensityZone;
        week.zones[zone] += tss;
        week.totalTSS += tss;
      }

      // Convert TSS values to percentages
      const weeklyDataArray = Array.from(weeklyData.values()).map((week) => {
        const zones: Record<IntensityZone, number> = {
          recovery: 0,
          endurance: 0,
          tempo: 0,
          threshold: 0,
          vo2max: 0,
          anaerobic: 0,
          neuromuscular: 0,
        };

        if (week.totalTSS > 0) {
          for (const zone in week.zones) {
            const zoneKey = zone as IntensityZone;
            zones[zoneKey] =
              Math.round((week.zones[zoneKey] / week.totalTSS) * 1000) / 10;
          }
        }

        return {
          weekStart: week.weekStart,
          totalTSS: Math.round(week.totalTSS),
          zones,
        };
      });

      return {
        weeklyData: weeklyDataArray.sort(
          (a, b) =>
            new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime(),
        ),
      };
    }),

  // ------------------------------
  // Consistency Metrics
  // ------------------------------
  getConsistencyMetrics: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const { data: activities, error } = await ctx.supabase
        .from("activities")
        .select("started_at")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .order("started_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      if (!activities || activities.length === 0) {
        return {
          activityDays: [],
          weeklyAvg: 0,
          currentStreak: 0,
          longestStreak: 0,
          totalActivities: 0,
          totalDays: 0,
        };
      }

      // Get unique activity days
      const activityDaysSet = new Set<string>();
      for (const activity of activities) {
        const dateStr = new Date(activity.started_at)
          .toISOString()
          .split("T")[0];
        if (dateStr) activityDaysSet.add(dateStr);
      }

      const activityDays = Array.from(activityDaysSet).sort();

      // Calculate streaks
      let currentStreak = 0;
      let longestStreak = 0;
      let tempStreak = 1;

      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      // Check if current streak is active
      if (
        activityDays.includes(today || "") ||
        activityDays.includes(yesterdayStr || "")
      ) {
        currentStreak = 1;

        // Count backwards from most recent day
        for (let i = activityDays.length - 2; i >= 0; i--) {
          const currentDate = new Date(activityDays[i]!);
          const nextDate = new Date(activityDays[i + 1]!);
          const diffDays = Math.round(
            (nextDate.getTime() - currentDate.getTime()) /
              (1000 * 60 * 60 * 24),
          );

          if (diffDays === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }

      // Calculate longest streak
      for (let i = 1; i < activityDays.length; i++) {
        const prevDate = new Date(activityDays[i - 1]!);
        const currDate = new Date(activityDays[i]!);
        const diffDays = Math.round(
          (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 1) {
          tempStreak++;
          longestStreak = Math.max(longestStreak, tempStreak);
        } else {
          tempStreak = 1;
        }
      }

      longestStreak = Math.max(longestStreak, tempStreak);

      // Calculate weekly average
      const startDate = new Date(input.start_date);
      const endDate = new Date(input.end_date);
      const totalDays =
        Math.round(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        ) + 1;
      const totalWeeks = totalDays / 7;
      const weeklyAvg =
        totalWeeks > 0
          ? Math.round((activities.length / totalWeeks) * 10) / 10
          : 0;

      return {
        activityDays,
        weeklyAvg,
        currentStreak,
        longestStreak,
        totalActivities: activities.length,
        totalDays,
      };
    }),

  // ------------------------------
  // Peak Performances / Personal Records
  // ------------------------------
  getPeakPerformances: protectedProcedure
    .input(peakPerformancesSchema)
    .query(async ({ ctx, input }) => {
      // Build query
      let query = ctx.supabase
        .from("activities")
        .select(
          "id, name, started_at, distance_meters, moving_seconds, metrics, type",
        )
        .eq("profile_id", ctx.session.user.id);

      if (input.type) {
        query = query.eq("type", input.type);
      }

      // Order by the selected metric
      // Note: We can't order by JSONB fields directly, so we'll fetch all and sort in memory
      switch (input.metric) {
        case "distance":
          query = query
            .order("distance_meters", { ascending: false })
            .not("distance_meters", "is", null);
          break;
        case "duration":
          query = query
            .order("moving_seconds", { ascending: false })
            .not("moving_seconds", "is", null);
          break;
        case "speed":
        case "power":
        case "tss":
          // These are in JSONB, can't order in DB efficiently
          // Will sort after fetching
          break;
      }

      // For metrics stored in JSONB, we need more records to sort
      if (["speed", "power", "tss"].includes(input.metric)) {
        query = query.limit(input.limit * 10); // Fetch more to sort
      } else {
        query = query.limit(input.limit);
      }

      const { data: activities, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      if (!activities || activities.length === 0) {
        return { performances: [] };
      }

      // Map activities to performances with extracted values
      const allPerformances = activities
        .map((activity) => {
          const metrics = (activity.metrics as Record<string, any>) || {};
          let value: number | null = null;
          let unit = "";

          switch (input.metric) {
            case "distance":
              value = activity.distance_meters;
              unit = "m";
              break;
            case "speed":
              value = metrics.avg_speed;
              unit = "m/s";
              break;
            case "power":
              value = metrics.avg_power;
              unit = "W";
              break;
            case "duration":
              value = activity.moving_seconds;
              unit = "s";
              break;
            case "tss":
              value = metrics.tss;
              unit = "TSS";
              break;
          }

          return {
            activityId: activity.id,
            activityName: activity.name,
            date: activity.started_at,
            value,
            unit,
            category: activity.type,
          };
        })
        .filter((p) => p.value !== null && p.value !== undefined);

      // Sort by value descending for JSONB metrics
      if (["speed", "power", "tss"].includes(input.metric)) {
        allPerformances.sort((a, b) => (b.value || 0) - (a.value || 0));
      }

      // Take top N and add ranks
      const performances = allPerformances
        .slice(0, input.limit)
        .map((perf, index) => ({
          ...perf,
          rank: index + 1,
        }));

      return { performances };
    }),
});
