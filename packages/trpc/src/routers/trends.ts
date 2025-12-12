import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  calculateATL,
  calculateCTL,
  calculateTSB,
  getFormStatus,
  getTrainingIntensityZone,
} from "@repo/core";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Input schemas
const dateRangeSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
});

const volumeTrendsSchema = dateRangeSchema.extend({
  groupBy: z.enum(["day", "week", "month"]).default("week"),
  activity_category: z
    .enum(["run", "bike", "swim", "strength", "other"])
    .optional(),
});

const performanceTrendsSchema = dateRangeSchema.extend({
  activity_category: z
    .enum(["run", "bike", "swim", "strength", "other"])
    .optional(),
});

const zoneDistributionTrendsSchema = dateRangeSchema.extend({
  metric: z.enum(["power", "heartrate"]).default("power"),
});

const peakPerformancesSchema = z.object({
  activity_category: z
    .enum(["run", "bike", "swim", "strength", "other"])
    .optional(),
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
          "started_at, distance, moving_time, elapsed_time, activity_category",
        )
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .order("started_at", { ascending: true });

      // Filter by category if provided
      if (input.activity_category) {
        query = query.eq("activity_category", input.activity_category);
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
        group.totalDistance += activity.distance || 0;
        group.totalTime += activity.moving_time || activity.elapsed_time || 0;
        group.activityCount += 1;
      }

      // Convert to array and sort
      const dataPoints = Array.from(groupedData.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      // Calculate totals
      const totals = {
        totalDistance: activities.reduce(
          (sum, a) => sum + (a.distance || 0),
          0,
        ),
        totalTime: activities.reduce(
          (sum, a) => sum + (a.moving_time || a.elapsed_time || 0),
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
          "id, name, started_at, distance, moving_time, avg_speed, avg_power, avg_heart_rate, activity_category",
        )
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .order("started_at", { ascending: true });

      if (input.activity_category) {
        query = query.eq("activity_category", input.activity_category);
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

      const dataPoints = activities.map((activity) => ({
        date: activity.started_at,
        activityId: activity.id,
        activityName: activity.name,
        avgSpeed: activity.avg_speed || null,
        avgPower: activity.avg_power || null,
        avgHeartRate: activity.avg_heart_rate || null,
        distance: activity.distance || 0,
        duration: activity.moving_time || 0,
      }));

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
        .select("started_at, training_stress_score")
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
        const tss = activity.training_stress_score || 0;
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
      const currentStatus = dataPoints.length > 0 ? {
        ctl: Math.round(finalCTL * 10) / 10,
        atl: Math.round(finalATL * 10) / 10,
        tsb: Math.round(finalTSB * 10) / 10,
        form: getFormStatus(finalTSB),
      } : null;

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
        .select("id, started_at, training_stress_score, intensity_factor")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .not("intensity_factor", "is", null)
        .not("training_stress_score", "is", null)
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
        const intensityFactor = (activity.intensity_factor || 0) / 100;
        const tss = activity.training_stress_score || 0;

        const zone = getTrainingIntensityZone(intensityFactor) as IntensityZone;
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
            zones[zoneKey] = Math.round(
              (week.zones[zoneKey] / week.totalTSS) * 1000,
            ) / 10;
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
        totalWeeks > 0 ? Math.round((activities.length / totalWeeks) * 10) / 10 : 0;

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
          "id, name, started_at, distance, moving_time, avg_speed, avg_power, max_power, training_stress_score, activity_category",
        )
        .eq("profile_id", ctx.session.user.id);

      if (input.activity_category) {
        query = query.eq("activity_category", input.activity_category);
      }

      // Order by the selected metric
      switch (input.metric) {
        case "distance":
          query = query
            .order("distance", { ascending: false })
            .not("distance", "is", null);
          break;
        case "speed":
          query = query
            .order("avg_speed", { ascending: false })
            .not("avg_speed", "is", null);
          break;
        case "power":
          query = query
            .order("avg_power", { ascending: false })
            .not("avg_power", "is", null);
          break;
        case "duration":
          query = query
            .order("moving_time", { ascending: false })
            .not("moving_time", "is", null);
          break;
        case "tss":
          query = query
            .order("training_stress_score", { ascending: false })
            .not("training_stress_score", "is", null);
          break;
      }

      query = query.limit(input.limit);

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

      const performances = activities.map((activity, index) => {
        let value: number | null = null;
        let unit = "";

        switch (input.metric) {
          case "distance":
            value = activity.distance;
            unit = "m";
            break;
          case "speed":
            value = activity.avg_speed;
            unit = "m/s";
            break;
          case "power":
            value = activity.avg_power;
            unit = "W";
            break;
          case "duration":
            value = activity.moving_time;
            unit = "s";
            break;
          case "tss":
            value = activity.training_stress_score;
            unit = "TSS";
            break;
        }

        return {
          rank: index + 1,
          activityId: activity.id,
          activityName: activity.name,
          date: activity.started_at,
          value,
          unit,
          category: activity.activity_category,
        };
      });

      return { performances };
    }),
});
