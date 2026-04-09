import { randomUUID } from "node:crypto";
import {
  calculateRouteStats,
  encodeElevationPolyline,
  encodePolyline,
  simplifyCoordinates,
} from "@repo/core";
import {
  type ActivityRouteRow,
  activityPlans,
  activityRoutes,
  likes,
  publicActivityCategorySchema,
  publicActivityRoutesRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gt, ilike, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { parseRoute, validateRoute } from "../lib/routes/route-parser";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const storageService = getApiStorageService();

const ROUTES_BUCKET = "gpx-routes";

// Input schemas
const activityCategoryFilterSchema = z.union([publicActivityCategorySchema, z.literal("all")]);

const routeIdSchema = z.string().uuid();

const routeCursorSchema = z.string().superRefine((value, ctx) => {
  const separatorIndex = value.indexOf("_");
  if (separatorIndex <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cursor must be in '<iso-date>_<uuid>' format",
    });
    return;
  }

  const createdAt = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);

  if (!z.string().datetime().safeParse(createdAt).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cursor timestamp must be a valid ISO datetime",
      path: ["created_at"],
    });
  }

  if (!routeIdSchema.safeParse(id).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cursor id must be a valid UUID",
      path: ["id"],
    });
  }
});

const routeCoordinateSchema = z
  .object({
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    altitude: z.number().finite().optional(),
  })
  .strict();

const parsedRouteSchema = z
  .object({
    name: z.string().optional(),
    coordinates: z.array(routeCoordinateSchema),
    metadata: z
      .object({
        author: z.string().optional(),
        time: z.string().optional(),
        bounds: z
          .object({
            minLat: z.number().finite(),
            maxLat: z.number().finite(),
            minLng: z.number().finite(),
            maxLng: z.number().finite(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const serializedActivityRouteSchema = z
  .object({
    ...publicActivityRoutesRowSchema.shape,
    idx: z.number().int().nonnegative().default(0),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strip();

const activityRouteWithLikeSchema = serializedActivityRouteSchema
  .extend({
    has_liked: z.boolean(),
  })
  .strict();

const listRoutesOutputSchema = z
  .object({
    items: z.array(activityRouteWithLikeSchema),
    nextCursor: z.string().optional(),
  })
  .strict();

const loadFullRouteOutputSchema = z
  .object({
    id: routeIdSchema,
    name: z.string(),
    coordinates: z.array(routeCoordinateSchema),
    totalDistance: z.number().nullable(),
    totalAscent: z.number().nullable(),
    totalDescent: z.number().nullable(),
    activityCategory: publicActivityCategorySchema,
  })
  .strict();

const deleteRouteOutputSchema = z.object({ success: z.literal(true) }).strict();

const listRoutesSchema = z
  .object({
    activityCategory: activityCategoryFilterSchema.optional(),
    search: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
    cursor: routeCursorSchema.optional(),
  })
  .strict();

const uploadRouteSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(1000).optional(),
    activityCategory: publicActivityCategorySchema,
    fileContent: z.string().min(1),
    fileName: z.string().min(1),
    source: z.string().optional(),
  })
  .strict();

function serializeActivityRouteRow(row: ActivityRouteRow) {
  return serializedActivityRouteSchema.parse({
    ...row,
    idx: row.idx ?? 0,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  });
}

function parseStoredRouteFile(fileContent: string) {
  const parsed = parsedRouteSchema.safeParse(parseRoute(fileContent, "gpx"));
  if (!parsed.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored route file contained invalid route data",
    });
  }

  return parsed.data;
}

function parseUploadedRouteFile(fileContent: string) {
  const parsed = parsedRouteSchema.safeParse(parseRoute(fileContent, "gpx"));
  if (!parsed.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Failed to process route file",
    });
  }

  return parsed.data;
}

export const routesRouter = createTRPCRouter({
  // ------------------------------
  // List routes with encoded polylines for preview
  // ------------------------------
  list: protectedProcedure
    .input(listRoutesSchema)
    .output(listRoutesOutputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const limit = input.limit;
      const conditions = [eq(activityRoutes.profile_id, ctx.session.user.id)];

      if (input.activityCategory && input.activityCategory !== "all") {
        conditions.push(eq(activityRoutes.activity_category, input.activityCategory));
      }

      if (input.search) {
        conditions.push(ilike(activityRoutes.name, `%${input.search}%`));
      }

      if (input.cursor) {
        const [cursorDate, cursorId] = input.cursor.split("_");
        if (cursorDate && cursorId) {
          const cursorCreatedAt = new Date(cursorDate);
          const cursorCondition = or(
            lt(activityRoutes.created_at, cursorCreatedAt),
            and(eq(activityRoutes.created_at, cursorCreatedAt), gt(activityRoutes.id, cursorId)),
          );

          if (cursorCondition) {
            conditions.push(cursorCondition);
          }
        }
      }

      const rows = await db
        .select()
        .from(activityRoutes)
        .where(and(...conditions))
        .orderBy(desc(activityRoutes.created_at), asc(activityRoutes.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const items = pageRows.map(serializeActivityRouteRow);

      let nextCursor: string | undefined;
      if (hasMore && pageRows.length > 0) {
        const lastItem = pageRows[pageRows.length - 1];
        if (!lastItem) throw new Error("Unexpected error");
        nextCursor = `${lastItem.created_at.toISOString()}_${lastItem.id}`;
      }

      const routeIds = items.map((route) => route.id);
      let userLikes: string[] = [];

      if (routeIds.length > 0) {
        const likeRows = await db
          .select({ entity_id: likes.entity_id })
          .from(likes)
          .where(
            and(
              eq(likes.profile_id, ctx.session.user.id),
              eq(likes.entity_type, "route"),
              inArray(likes.entity_id, routeIds),
            ),
          );

        userLikes = likeRows.map((row) => row.entity_id);
      }

      return {
        items: items.map((route) =>
          activityRouteWithLikeSchema.parse({
            ...route,
            has_liked: userLikes.includes(route.id),
          }),
        ),
        nextCursor,
      };
    }),

  // ------------------------------
  // Get single route details (without full coordinates)
  // ------------------------------
  get: protectedProcedure
    .input(z.object({ id: routeIdSchema }).strict())
    .output(activityRouteWithLikeSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const [route] = await db
        .select()
        .from(activityRoutes)
        .where(
          and(eq(activityRoutes.id, input.id), eq(activityRoutes.profile_id, ctx.session.user.id)),
        )
        .limit(1);

      if (!route) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route not found",
        });
      }

      const [likeData] = await db
        .select({ id: likes.id })
        .from(likes)
        .where(
          and(
            eq(likes.profile_id, ctx.session.user.id),
            eq(likes.entity_type, "route"),
            eq(likes.entity_id, input.id),
          ),
        )
        .limit(1);

      return activityRouteWithLikeSchema.parse({
        ...serializeActivityRouteRow(route),
        has_liked: !!likeData,
      });
    }),

  // ------------------------------
  // Load full route coordinates for recording
  // ------------------------------
  loadFull: protectedProcedure
    .input(z.object({ id: routeIdSchema }).strict())
    .output(loadFullRouteOutputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const [routeData] = await db
        .select()
        .from(activityRoutes)
        .where(
          and(eq(activityRoutes.id, input.id), eq(activityRoutes.profile_id, ctx.session.user.id)),
        )
        .limit(1);

      if (!routeData) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route not found",
        });
      }

      if (!routeData.file_path) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Route file path missing",
        });
      }

      const { data: fileData, error: storageError } = await storageService.storage
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
      const parsed = parseStoredRouteFile(fileContent);

      return loadFullRouteOutputSchema.parse({
        id: routeData.id,
        name: routeData.name,
        coordinates: parsed.coordinates,
        totalDistance: routeData.total_distance,
        totalAscent: routeData.total_ascent,
        totalDescent: routeData.total_descent,
        activityCategory: routeData.activity_category,
      });
    }),

  // ------------------------------
  // Upload and process new route
  // ------------------------------
  upload: protectedProcedure
    .input(uploadRouteSchema)
    .output(serializedActivityRouteSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const db = getRequiredDb(ctx);

        // Parse the route file
        const parsed = parseUploadedRouteFile(input.fileContent);

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
        const tolerance = calculateSimplificationTolerance(parsed.coordinates.length);
        const simplified = simplifyCoordinates(parsed.coordinates, tolerance);

        // Encode polyline for storage
        const polyline = encodePolyline(simplified);

        // Encode elevation if available
        let elevationPolyline: string | null = null;
        if (simplified.some((coord) => coord.altitude !== undefined)) {
          const elevations = simplified.map((coord) => coord.altitude || 0);
          elevationPolyline = encodeElevationPolyline(elevations);
        }

        // Generate unique file path
        const fileExtension = input.fileName.split(".").pop() || "gpx";
        const timestamp = Date.now();
        const filePath = `${ctx.session.user.id}/${timestamp}.${fileExtension}`;

        const { error: uploadError } = await storageService.storage
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

        try {
          const [routeData] = await db
            .insert(activityRoutes)
            .values({
              id: randomUUID(),
              created_at: new Date(),
              updated_at: new Date(),
              profile_id: ctx.session.user.id,
              name: input.name,
              description: input.description,
              activity_category: input.activityCategory,
              file_path: filePath,
              total_distance: stats.totalDistance,
              total_ascent: stats.totalAscent,
              total_descent: stats.totalDescent,
              polyline,
              elevation_polyline: elevationPolyline,
              source: input.source,
              is_public: false,
            })
            .returning();

          if (!routeData) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to save route",
            });
          }

          return serializeActivityRouteRow(routeData);
        } catch (dbError) {
          // Cleanup: delete uploaded file if database insert fails
          await storageService.storage.from(ROUTES_BUCKET).remove([filePath]);

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to save route: ${dbError instanceof Error ? dbError.message : "Unknown database error"}`,
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to process route file",
        });
      }
    }),

  // ------------------------------
  // Delete route
  // ------------------------------
  delete: protectedProcedure
    .input(z.object({ id: routeIdSchema }).strict())
    .output(deleteRouteOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const [route] = await db
        .select()
        .from(activityRoutes)
        .where(
          and(eq(activityRoutes.id, input.id), eq(activityRoutes.profile_id, ctx.session.user.id)),
        )
        .limit(1);

      if (!route) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route not found or you don't have permission to delete it",
        });
      }

      const [plansCountRow] = await db
        .select({ value: count() })
        .from(activityPlans)
        .where(eq(activityPlans.route_id, input.id));

      const plansCount = plansCountRow?.value ?? 0;

      if (plansCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete route because it is used by ${plansCount} activity plan${plansCount > 1 ? "s" : ""}. Please remove the route from those plans first.`,
        });
      }

      const [deletedRoute] = await db
        .delete(activityRoutes)
        .where(
          and(eq(activityRoutes.id, input.id), eq(activityRoutes.profile_id, ctx.session.user.id)),
        )
        .returning({ id: activityRoutes.id });

      if (!deletedRoute) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete route",
        });
      }

      if (route.file_path) {
        await storageService.storage.from(ROUTES_BUCKET).remove([route.file_path]);
      }

      return deleteRouteOutputSchema.parse({ success: true });
    }),

  // ------------------------------
  // Update route metadata
  // ------------------------------
  update: protectedProcedure
    .input(
      z
        .object({
          id: routeIdSchema,
          name: z.string().min(1).max(100).optional(),
          description: z.string().max(1000).optional(),
        })
        .strict(),
    )
    .output(serializedActivityRouteSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const { id, ...updates } = input;

      const [existing] = await db
        .select({ id: activityRoutes.id })
        .from(activityRoutes)
        .where(and(eq(activityRoutes.id, id), eq(activityRoutes.profile_id, ctx.session.user.id)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route not found or you don't have permission to edit it",
        });
      }

      const [data] = await db
        .update(activityRoutes)
        .set({
          ...updates,
          updated_at: new Date(),
        })
        .where(and(eq(activityRoutes.id, id), eq(activityRoutes.profile_id, ctx.session.user.id)))
        .returning();

      if (!data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update route",
        });
      }

      return serializeActivityRouteRow(data);
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
