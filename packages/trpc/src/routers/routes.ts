import {
    calculateRouteStats,
    encodeElevationPolyline,
    encodePolyline,
    simplifyCoordinates
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { parseRoute, validateRoute } from "../lib/routes/route-parser";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const ROUTES_BUCKET = "gpx-routes";

// Input schemas
const listRoutesSchema = z.object({
  activityType: z
    .enum([
      "outdoor_run",
      "outdoor_bike",
      "indoor_treadmill",
      "indoor_bike_trainer",
      "all",
    ])
    .optional(),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const uploadRouteSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  activityType: z.enum([
    "outdoor_run",
    "outdoor_bike",
    "indoor_treadmill",
    "indoor_bike_trainer",
  ]),
  fileContent: z.string().min(1),
  fileName: z.string(),
  source: z.string().optional(),
});

export const routesRouter = createTRPCRouter({
  // ------------------------------
  // List routes with encoded polylines for preview
  // ------------------------------
  list: protectedProcedure
    .input(listRoutesSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;

      let query = ctx.supabase
        .from("activity_routes")
        .select(
          `
          id,
          idx,
          name,
          description,
          activity_type,
          total_distance,
          total_ascent,
          total_descent,
          polyline,
          elevation_polyline,
          source,
          created_at
        `,
        )
        .eq("profile_id", ctx.session.user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(limit + 1);

      // Apply activity type filter
      if (input.activityType && input.activityType !== "all") {
        query = query.eq("activity_type", input.activityType);
      }

      // Apply cursor
      if (input.cursor) {
        const [cursorDate, cursorId] = input.cursor.split("_");
        query = query.or(
          `created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.gt.${cursorId})`,
        );
      }

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const hasMore = data.length > limit;
      const items = hasMore ? data.slice(0, limit) : data;

      let nextCursor: string | undefined;
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1];
        if (!lastItem) throw new Error("Unexpected error");
        nextCursor = `${lastItem.created_at}_${lastItem.id}`;
      }

      return {
        items,
        nextCursor,
      };
    }),

  // ------------------------------
  // Get single route details (without full coordinates)
  // ------------------------------
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("activity_routes")
        .select(
          `
          id,
          idx,
          name,
          description,
          activity_type,
          total_distance,
          total_ascent,
          total_descent,
          polyline,
          elevation_polyline,
          source,
          created_at
        `,
        )
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route not found",
        });
      }

      return data;
    }),

  // ------------------------------
  // Load full route coordinates for recording
  // ------------------------------
  loadFull: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get route metadata from database
      const { data: routeData, error: dbError } = await ctx.supabase
        .from("activity_routes")
        .select(
          `
          id,
          name,
          file_path,
          total_distance,
          total_ascent,
          total_descent,
          activity_type
        `,
        )
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (dbError || !routeData) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route not found",
        });
      }

      // Load full GPX file from storage
      const { data: fileData, error: storageError } = await ctx.supabase.storage
        .from(ROUTES_BUCKET)
        .download(routeData.file_path);

      if (storageError || !fileData) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load route file from storage",
        });
      }

      // Parse GPX file
      const fileContent = await fileData.text();
      const parsed = parseRoute(fileContent, "gpx");

      return {
        id: routeData.id,
        name: routeData.name,
        coordinates: parsed.coordinates,
        totalDistance: routeData.total_distance,
        totalAscent: routeData.total_ascent,
        totalDescent: routeData.total_descent,
        activityType: routeData.activity_type,
      };
    }),

  // ------------------------------
  // Upload and process new route
  // ------------------------------
  upload: protectedProcedure
    .input(uploadRouteSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Parse the route file
        const parsed = parseRoute(input.fileContent, "gpx");

        // Validate parsed route
        const validation = validateRoute(parsed);
        if (!validation.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid route: ${validation.errors.join(", ")}`,
          });
        }

        // Calculate route statistics
        const stats = calculateRouteStats(parsed.coordinates);

        // Simplify coordinates for preview (target ~150-200 points)
        const tolerance = calculateSimplificationTolerance(
          parsed.coordinates.length,
        );
        const simplified = simplifyCoordinates(parsed.coordinates, tolerance);

        // Encode polyline for storage
        const polyline = encodePolyline(simplified);

        // Encode elevation if available
        let elevationPolyline: string | null = null;
        if (simplified.some((coord) => coord.altitude !== undefined)) {
          const elevations = simplified.map(
            (coord) => coord.altitude || 0,
          );
          elevationPolyline = encodeElevationPolyline(elevations);
        }

        // Generate unique file path
        const fileExtension = input.fileName.split(".").pop() || "gpx";
        const timestamp = Date.now();
        const filePath = `${ctx.session.user.id}/${timestamp}.${fileExtension}`;

        // Upload original file to storage
        const { error: uploadError } = await ctx.supabase.storage
          .from(ROUTES_BUCKET)
          .upload(filePath, input.fileContent, {
            contentType: "application/gpx+xml",
            upsert: false,
          });

        if (uploadError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to upload route file: ${uploadError.message}`,
          });
        }

        // Save route metadata to database
        const { data: routeData, error: dbError } = await ctx.supabase
          .from("activity_routes")
          .insert({
            profile_id: ctx.session.user.id,
            name: input.name,
            description: input.description,
            activity_type: input.activityType,
            file_path: filePath,
            total_distance: stats.totalDistance,
            total_ascent: stats.totalAscent,
            total_descent: stats.totalDescent,
            polyline: polyline,
            elevation_polyline: elevationPolyline,
            source: input.source,
          })
          .select(
            `
            id,
            idx,
            name,
            description,
            activity_type,
            total_distance,
            total_ascent,
            total_descent,
            polyline,
            elevation_polyline,
            source,
            created_at
          `,
          )
          .single();

        if (dbError) {
          // Cleanup: delete uploaded file if database insert fails
          await ctx.supabase.storage.from(ROUTES_BUCKET).remove([filePath]);

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to save route: ${dbError.message}`,
          });
        }

        return routeData;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Failed to process route file",
        });
      }
    }),

  // ------------------------------
  // Delete route
  // ------------------------------
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get route details
      const { data: route, error: fetchError } = await ctx.supabase
        .from("activity_routes")
        .select("id, file_path, profile_id")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (fetchError || !route) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route not found or you don't have permission to delete it",
        });
      }

      // Check if route is being used by any activity plans
      const { count: plansCount } = await ctx.supabase
        .from("activity_plans")
        .select("id", { count: "exact", head: true })
        .eq("route_id", input.id);

      if (plansCount && plansCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete route because it is used by ${plansCount} activity plan${plansCount > 1 ? "s" : ""}. Please remove the route from those plans first.`,
        });
      }

      // Delete from database first
      const { error: deleteError } = await ctx.supabase
        .from("activity_routes")
        .delete()
        .eq("id", input.id);

      if (deleteError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: deleteError.message,
        });
      }

      // Delete file from storage (best effort - don't fail if this fails)
      await ctx.supabase.storage.from(ROUTES_BUCKET).remove([route.file_path]);

      return { success: true };
    }),

  // ------------------------------
  // Update route metadata
  // ------------------------------
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("activity_routes")
        .select("id")
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route not found or you don't have permission to edit it",
        });
      }

      const { data, error } = await ctx.supabase
        .from("activity_routes")
        .update(updates)
        .eq("id", id)
        .select(
          `
          id,
          idx,
          name,
          description,
          activity_type,
          total_distance,
          total_ascent,
          total_descent,
          polyline,
          elevation_polyline,
          source,
          created_at
        `,
        )
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),
});

/**
 * Calculate simplification tolerance based on number of points
 * Target: ~150-200 points for preview
 */
function calculateSimplificationTolerance(pointCount: number): number {
  if (pointCount <= 200) return 0; // Don't simplify if already small
  if (pointCount <= 500) return 0.0001; // ~11 meters
  if (pointCount <= 1000) return 0.0002; // ~22 meters
  if (pointCount <= 2000) return 0.0003; // ~33 meters
  return 0.0005; // ~55 meters for very large routes
}
