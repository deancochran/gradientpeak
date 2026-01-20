import {
  publicActivitiesInsertSchema,
  publicActivityStreamsInsertSchema,
} from "@repo/supabase";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  calculateTSSFromAvailableData,
  calculatePowerCurve,
  analyzePowerCurve,
  calculatePaceCurve,
  analyzePaceCurve,
  calculateHRCurve,
  detectPowerTestEfforts,
  detectRunningTestEfforts,
  detectHRTestEfforts,
  estimateFTPFromWeight,
  estimateMaxHR,
  estimateLTHR,
  decompressAllStreams,
  extractNumericStream,
  calculateAge,
} from "@repo/core";

export const activitiesRouter = createTRPCRouter({
  // List activities by date range (legacy - for trends/analytics)
  list: protectedProcedure
    .input(
      z.object({
        date_from: z.string(),
        date_to: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("activities")
        .select(
          `
          id, name, type, location,
          started_at, finished_at,
          duration_seconds, moving_seconds, distance_meters,
          metrics, hr_zone_seconds, power_zone_seconds,
          activity_plan_id
        `,
        )
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.date_from)
        .lte("started_at", input.date_to)
        .order("started_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    }),

  // Paginated list of activities with filters
  listPaginated: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        activity_category: z
          .enum(["run", "bike", "swim", "strength", "other"])
          .optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        sort_by: z
          .enum(["date", "distance", "duration", "tss"])
          .default("date"),
        sort_order: z.enum(["asc", "desc"]).default("desc"),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("activities")
        .select(
          `
          id, name, type, location,
          started_at, duration_seconds, moving_seconds, distance_meters,
          metrics, profile_snapshot, route_id, activity_plan_id, profile_id
        `,
          { count: "exact" },
        )
        .eq("profile_id", ctx.session.user.id);

      // Apply filters
      if (input.activity_category) {
        query = query.eq("type", input.activity_category); // Updated column name
      }
      if (input.date_from) {
        query = query.gte("started_at", input.date_from);
      }
      if (input.date_to) {
        query = query.lte("started_at", input.date_to);
      }

      // Apply sorting
      const sortColumn = {
        date: "started_at",
        distance: "distance_meters", // Updated column name
        duration: "duration_seconds", // Updated column name
        tss: "metrics->tss", // Now in JSONB
      }[input.sort_by];

      query = query.order(sortColumn, {
        ascending: input.sort_order === "asc",
      });

      // Apply pagination
      query = query.range(input.offset, input.offset + input.limit - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      return {
        items: data || [],
        total: count || 0,
        hasMore: (count || 0) > input.offset + input.limit,
      };
    }),

  // Simplified: Just create the activity first
  create: protectedProcedure
    .input(
      publicActivitiesInsertSchema.omit({
        id: true,
        idx: true,
        created_at: true,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await ctx.supabase
        .from("activities")
        .insert(input)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }),

  // Then create streams for that activity
  createStreams: protectedProcedure
    .input(
      z.object({
        activity_id: z.string().uuid(),
        streams: z.array(
          z.object({
            type: z.union([
              z.literal("heartrate"),
              z.literal("power"),
              z.literal("speed"),
              z.literal("cadence"),
              z.literal("distance"),
              z.literal("latlng"),
              z.literal("moving"),
              z.literal("altitude"),
              z.literal("elevation"),
              z.literal("temperature"),
              z.literal("gradient"),
              z.literal("heading"),
            ]),
            data_type: z.union([
              z.literal("float"),
              z.literal("latlng"),
              z.literal("boolean"),
            ]),
            compressed_values: z.string(),
            compressed_timestamps: z.string(),
            sample_count: z.number(),
            original_size: z.number(),
            min_value: z.number().nullable().optional(),
            max_value: z.number().nullable().optional(),
            avg_value: z.number().nullable().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const streamsWithActivityId = input.streams.map((stream) => ({
        ...stream,
        activity_id: input.activity_id,
      }));

      const { data, error } = await ctx.supabase
        .from("activity_streams")
        .insert(streamsWithActivityId)
        .select();

      if (error) throw new Error(error.message);
      return data;
    }),

  // Combined mutation that handles both in sequence with proper error handling
  createWithStreams: protectedProcedure
    .input(
      z.object({
        activity: z.object({
          profile_id: z.string(),
          name: z.string(),
          type: z.string(),
          started_at: z.string(),
          finished_at: z.string(),
          duration_seconds: z.number().optional(),
          moving_seconds: z.number().optional(),
          distance_meters: z.number().optional(),
          location: z.string().nullable().optional(),
          metrics: z.any().optional(),
          hr_zone_seconds: z.array(z.number()).nullable().optional(),
          power_zone_seconds: z.array(z.number()).nullable().optional(),
          profile_snapshot: z.any().nullable().optional(),
          activity_plan_id: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          is_private: z.boolean().optional(),
          external_id: z.string().nullable().optional(),
          provider: z
            .union([
              z.literal("strava"),
              z.literal("wahoo"),
              z.literal("trainingpeaks"),
              z.literal("garmin"),
              z.literal("zwift"),
            ])
            .nullable()
            .optional(),
          avg_target_adherence: z.number().nullable().optional(),
        }),
        activity_streams: z.array(
          z.object({
            type: z.union([
              z.literal("heartrate"),
              z.literal("power"),
              z.literal("speed"),
              z.literal("cadence"),
              z.literal("distance"),
              z.literal("latlng"),
              z.literal("moving"),
              z.literal("altitude"),
              z.literal("elevation"),
              z.literal("temperature"),
              z.literal("gradient"),
              z.literal("heading"),
            ]),
            data_type: z.union([
              z.literal("float"),
              z.literal("latlng"),
              z.literal("boolean"),
            ]),
            compressed_values: z.string(),
            compressed_timestamps: z.string(),
            sample_count: z.number(),
            original_size: z.number(),
            min_value: z.number().nullable().optional(),
            max_value: z.number().nullable().optional(),
            avg_value: z.number().nullable().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // First create the activity
      const { data: activity, error: activityError } = await ctx.supabase
        .from("activities")
        .insert(input.activity)
        .select()
        .single();

      if (activityError) {
        throw new Error(`Failed to create activity: ${activityError.message}`);
      }

      // Then create the streams if there are any
      let streams = null;
      if (input.activity_streams.length > 0) {
        const streamsWithActivityId = input.activity_streams.map((stream) => ({
          ...stream,
          activity_id: activity.id,
        }));

        const { data: streamsData, error: streamsError } = await ctx.supabase
          .from("activity_streams")
          .insert(streamsWithActivityId)
          .select();

        if (streamsError) {
          // Clean up the created activity on stream failure
          await ctx.supabase.from("activities").delete().eq("id", activity.id);
          throw new Error(`Failed to create streams: ${streamsError.message}`);
        }
        streams = streamsData;
      }

      return activity;
    }),

  getActivityWithStreams: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { data, error } = await ctx.supabase
        .from("activities")
        .select(
          `
            *,
            activity_streams (
              id,
              type,
              data_type,
              original_size,
              compressed_values,
              compressed_timestamps,
              sample_count,
              min_value,
              max_value,
              avg_value,
              created_at
            ),
            activity_plans (
              id,
              name,
              structure
            )
          `,
        )
        .eq("id", input.id)
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Activity not found");

      return data;
    }),

  // Update activity (e.g., to set metrics after calculation)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        metrics: z
          .object({
            if: z.number().optional(),
            tss: z.number().optional(),
            normalized_power: z.number().optional(),
          })
          .optional(),
        name: z.string().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, metrics, ...otherUpdates } = input;

      // Build the update object
      const updates: Record<string, unknown> = { ...otherUpdates };

      // If metrics are provided, merge them with existing metrics
      if (metrics && Object.keys(metrics).length > 0) {
        // First get the current activity to merge metrics
        const { data: currentActivity, error: fetchError } = await ctx.supabase
          .from("activities")
          .select("metrics")
          .eq("id", id)
          .eq("profile_id", ctx.session.user.id)
          .single();

        if (fetchError) throw new Error(fetchError.message);

        // Merge new metrics with existing
        const existingMetrics =
          (currentActivity?.metrics as Record<string, unknown>) || {};
        updates.metrics = { ...existingMetrics, ...metrics };
      }

      const { data, error } = await ctx.supabase
        .from("activities")
        .update(updates)
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }),

  // Hard delete activity - permanently removes the record
  // Activity streams are automatically deleted via cascade
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership before deletion
      const { data: activity, error: fetchError } = await ctx.supabase
        .from("activities")
        .select("id, profile_id, name")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (fetchError || !activity) {
        throw new Error("Activity not found");
      }

      // Hard delete: remove the record (activity_streams cascade deleted automatically)
      const { error } = await ctx.supabase
        .from("activities")
        .delete()
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id);

      if (error) throw new Error(error.message);

      return { success: true, deletedActivityId: input.id };
    }),

  /**
   * Calculate TSS, IF, and other metrics for an activity.
   *
   * This is the core mutation for enhancing TSS/IF calculations with:
   * - Temporal metric lookups (FTP/LTHR/pace at activity date)
   * - Multi-modal calculation (power → HR → pace fallback)
   * - Intelligent defaults for missing metrics
   * - Test effort detection
   * - Performance curve analysis
   *
   * Called after activity upload (user-recorded or third-party import).
   */
  calculateMetrics: protectedProcedure
    .input(z.object({ activityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      // ==========================================
      // 1. Fetch Activity and Streams
      // ==========================================
      const { data: activity, error: activityError } = await supabase
        .from("activities")
        .select(
          `
          *,
          activity_streams (
            type,
            data_type,
            compressed_values,
            compressed_timestamps,
            sample_count,
            min_value,
            max_value,
            avg_value
          )
        `
        )
        .eq("id", input.activityId)
        .eq("profile_id", session.user.id)
        .single();

      if (activityError || !activity) {
        throw new Error(
          `Activity not found: ${activityError?.message || "Unknown error"}`
        );
      }

      const activityDate = new Date(activity.started_at);
      const activityCategory = (activity.type ||
        "other") as "run" | "bike" | "swim" | "strength" | "other";

      // ==========================================
      // 2. Extract and Decompress Streams
      // ==========================================
      const streamData = decompressAllStreams(
        (activity.activity_streams || []) as Array<{
          type: string;
          data_type: "float" | "latlng" | "boolean";
          compressed_values: string;
          compressed_timestamps: string;
        }>
      );

      // Extract numeric streams for calculations
      const powerStream = extractNumericStream(streamData, "power");
      const hrStream = extractNumericStream(streamData, "heartrate");
      const speedStream = extractNumericStream(streamData, "speed");
      const elevationStream = extractNumericStream(streamData, "altitude");
      const distanceStream = extractNumericStream(streamData, "distance");

      // Get timestamps from any available stream (all streams share timestamps)
      const timestamps =
        streamData.get("power")?.timestamps ||
        streamData.get("heartrate")?.timestamps ||
        streamData.get("speed")?.timestamps;

      // Verify we have timestamp data
      if (!timestamps || timestamps.length === 0) {
        throw new Error(
          "Cannot calculate metrics: No timestamp data available"
        );
      }

      // Calculate pace stream from speed if available
      let paceStream: number[] | undefined;
      if (speedStream && speedStream.length > 0) {
        // Convert speed (m/s) to pace (sec/km)
        paceStream = speedStream.map((speed) => {
          if (speed <= 0) return 0;
          return 1000 / speed; // seconds per km
        });
      }

      // ==========================================
      // 3. Get Weight (for weight-adjusted calculations)
      // ==========================================
      const { data: weightMetric } = await supabase
        .from("profile_metric_logs")
        .select("*")
        .eq("profile_id", session.user.id)
        .eq("metric_type", "weight_kg")
        .lte("recorded_at", activityDate.toISOString())
        .order("recorded_at", { ascending: false })
        .limit(1);

      const weight = weightMetric?.[0]?.value || 75; // Default 75kg

      // ==========================================
      // 4. Get or Estimate Power Metrics (FTP)
      // ==========================================
      let ftp: number | undefined;
      if (powerStream && powerStream.length > 0) {
        const { data: ftpMetric } = await supabase
          .from("profile_performance_metric_logs")
          .select("*")
          .eq("profile_id", session.user.id)
          .eq("category", activityCategory)
          .eq("type", "power")
          .eq("duration_seconds", 3600)
          .eq("is_active", true)
          .lte("recorded_at", activityDate.toISOString())
          .order("recorded_at", { ascending: false })
          .limit(1);

        if (!ftpMetric || ftpMetric.length === 0) {
          // Estimate FTP from weight
          const estimatedFTP = estimateFTPFromWeight(weight);
          ftp = estimatedFTP.value;

          // Store estimated FTP for future use
          await supabase.from("profile_performance_metric_logs").insert({
            profile_id: session.user.id,
            category: activityCategory,
            type: "power",
            value: ftp,
            unit: "watts",
            duration_seconds: 3600,
            source: "estimated",
            notes: `Estimated from weight (${weight}kg)`,
            recorded_at: activityDate.toISOString(),
          });
        } else if (ftpMetric[0]) {
          ftp = ftpMetric[0].value;
        }
      }

      // ==========================================
      // 5. Get or Estimate Heart Rate Metrics
      // ==========================================
      let lthr: number | undefined;
      let maxHR: number | undefined;
      if (hrStream && hrStream.length > 0) {
        // Get LTHR
        const { data: lthrMetric } = await supabase
          .from("profile_performance_metric_logs")
          .select("*")
          .eq("profile_id", session.user.id)
          .eq("category", activityCategory)
          .eq("type", "heart_rate")
          .eq("duration_seconds", 3600)
          .eq("is_active", true)
          .lte("recorded_at", activityDate.toISOString())
          .order("recorded_at", { ascending: false })
          .limit(1);

        // Get Max HR
        const { data: maxHRMetric } = await supabase
          .from("profile_performance_metric_logs")
          .select("*")
          .eq("profile_id", session.user.id)
          .eq("category", activityCategory)
          .eq("type", "heart_rate")
          .eq("duration_seconds", 0)
          .eq("is_active", true)
          .lte("recorded_at", activityDate.toISOString())
          .order("recorded_at", { ascending: false })
          .limit(1);

        lthr = lthrMetric?.[0]?.value;
        maxHR = maxHRMetric?.[0]?.value;

        // Estimate if missing
        if (!maxHR) {
          // Get age from profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("dob")
            .eq("id", session.user.id)
            .single();

          const age = calculateAge(profile?.dob || null) || 30; // Default to 30 if no DOB
          const estimatedMaxHR = estimateMaxHR(age);
          maxHR = estimatedMaxHR.value;

          await supabase.from("profile_performance_metric_logs").insert({
            profile_id: session.user.id,
            category: activityCategory,
            type: "heart_rate",
            value: maxHR,
            unit: "bpm",
            duration_seconds: 0,
            source: "estimated",
            notes: `Estimated from age (${age})`,
            recorded_at: activityDate.toISOString(),
          });
        }

        if (!lthr && maxHR) {
          const estimatedLTHR = estimateLTHR(maxHR);
          lthr = estimatedLTHR.value;

          await supabase.from("profile_performance_metric_logs").insert({
            profile_id: session.user.id,
            category: activityCategory,
            type: "heart_rate",
            value: lthr,
            unit: "bpm",
            duration_seconds: 3600,
            source: "estimated",
            notes: `Estimated from max HR (${maxHR} bpm)`,
            recorded_at: activityDate.toISOString(),
          });
        }
      }

      // ==========================================
      // 6. Get or Estimate Pace Metrics (Running)
      // ==========================================
      let thresholdPace: number | undefined;
      if (paceStream && paceStream.length > 0 && activityCategory === "run") {
        const { data: paceMetric } = await supabase
          .from("profile_performance_metric_logs")
          .select("*")
          .eq("profile_id", session.user.id)
          .eq("category", "run")
          .eq("type", "pace")
          .eq("duration_seconds", 3600)
          .eq("is_active", true)
          .lte("recorded_at", activityDate.toISOString())
          .order("recorded_at", { ascending: false })
          .limit(1);

        thresholdPace = paceMetric?.[0]?.value;

        // Estimate if missing (default 5:00 min/km)
        if (!thresholdPace) {
          thresholdPace = 300; // 5:00 min/km

          await supabase.from("profile_performance_metric_logs").insert({
            profile_id: session.user.id,
            category: "run",
            type: "pace",
            value: thresholdPace,
            unit: "sec/km",
            duration_seconds: 3600,
            source: "estimated",
            notes: "Default threshold pace",
            recorded_at: activityDate.toISOString(),
          });
        }
      }

      // ==========================================
      // 7. Calculate TSS (Multi-Modal)
      // ==========================================
      const tssResult = calculateTSSFromAvailableData({
        powerStream,
        hrStream,
        paceStream,
        elevationStream,
        timestamps,
        ftp,
        lthr,
        maxHR,
        thresholdPace,
        distance: activity.distance_meters || 0,
        weight,
      });

      if (!tssResult) {
        throw new Error("Unable to calculate TSS - insufficient data");
      }

      // ==========================================
      // 8. Calculate Performance Curves
      // ==========================================
      const curves: Record<string, unknown> = {};

      if (powerStream && powerStream.length > 0 && timestamps) {
        const powerCurvePoints = calculatePowerCurve(powerStream, timestamps);
        const powerCurveAnalysis = analyzePowerCurve(powerCurvePoints);
        curves.power = powerCurveAnalysis;
      }

      if (
        paceStream &&
        paceStream.length > 0 &&
        timestamps &&
        distanceStream &&
        activityCategory === "run"
      ) {
        const paceCurvePoints = calculatePaceCurve(
          paceStream,
          timestamps,
          distanceStream
        );
        const paceCurveAnalysis = analyzePaceCurve(paceCurvePoints);
        curves.pace = paceCurveAnalysis;
      }

      if (hrStream && hrStream.length > 0 && timestamps) {
        const hrCurvePoints = calculateHRCurve(hrStream, timestamps);
        curves.heartRate = { points: hrCurvePoints };
      }

      // ==========================================
      // 9. Detect Test Efforts
      // ==========================================
      const suggestions: Array<{
        type: string;
        value: number;
        confidence: string;
        detectionMethod: string;
      }> = [];

      if (powerStream && timestamps) {
        const powerTests = detectPowerTestEfforts(powerStream, timestamps);
        suggestions.push(...powerTests);

        // TODO: Store metric suggestions in database when metric_suggestions table is created
        // For now, suggestions are returned in the mutation result for UI display
      }

      if (
        paceStream &&
        timestamps &&
        distanceStream &&
        activityCategory === "run"
      ) {
        const runningTests = detectRunningTestEfforts(
          paceStream,
          timestamps,
          distanceStream
        );
        suggestions.push(...runningTests);
      }

      if (hrStream && timestamps) {
        const hrTests = detectHRTestEfforts(hrStream, timestamps);
        suggestions.push(...hrTests);
      }

      // ==========================================
      // 10. Update Activity with Calculated Metrics
      // ==========================================
      // Extract TSS value (HRSSResult uses 'hrss', others use 'tss')
      const tssValue =
        "tss" in tssResult ? tssResult.tss : tssResult.hrss;

      const metricsPayload = {
        tss: tssValue,
        tss_source: tssResult.source,
        tss_confidence: tssResult.confidence,
        normalized_power:
          "normalizedPower" in tssResult
            ? tssResult.normalizedPower
            : null,
        intensity_factor:
          "intensityFactor" in tssResult
            ? tssResult.intensityFactor
            : null,
        variability_index:
          "variabilityIndex" in tssResult
            ? tssResult.variabilityIndex
            : null,
        hrss: "hrss" in tssResult ? tssResult.hrss : null,
        avg_hr: "avgHR" in tssResult ? tssResult.avgHR : null,
        normalized_pace:
          "normalizedPace" in tssResult ? tssResult.normalizedPace : null,
        curves,
      };

      const { error: updateError } = await supabase
        .from("activities")
        .update({
          metrics: metricsPayload as any, // Cast to Json type for Supabase
        })
        .eq("id", input.activityId);

      if (updateError) throw new Error(updateError.message);

      return {
        metrics: {
          tss: tssValue,
          ...tssResult,
        },
        curves,
        suggestions,
        calculationSource: tssResult.source,
      };
    }),
});
