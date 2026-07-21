import { randomUUID } from "node:crypto";
import {
  MAX_ROUTE_FILE_SIZE_BYTES,
  routeDescriptionSchema,
  routeNameSchema,
  safeRouteFileNameSchema,
} from "@repo/core/route-files";
import { type ActivityRouteRow, activityRoutes, events, groupEvents } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  serializeActivityRouteRow,
  serializedActivityRouteSchema,
} from "../application/routes/serializeActivityRouteRow";
import { getRequiredDb } from "../db";
import { logger } from "../lib/logger";
import {
  buildRouteFileArtifacts,
  getCanonicalRouteStorageFormat,
  getRouteContentSizeBytes,
  parseStoredRouteFile,
  ROUTES_BUCKET,
  routeCoordinateSchema,
} from "../lib/routes/route-file-helpers";
import { createContentAccessPermissions } from "../permissions/content-access";
import { getLikeStats, loadLikeStats } from "../repositories/like-stats";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { loadProfileIdentityMap, profileIdentitySchema } from "../utils/profile-identity";

const storageService = getApiStorageService();

// Input schemas
const routeOwnerScopeSchema = z.enum(["own", "system", "public", "all"]);

const routeIdSchema = z.string().uuid();

// Route library sorting spans multiple nullable columns. An explicit offset cursor keeps every
// supported sort deterministic and prevents applying a created-at cursor to distance/ascent sorts.
const routeCursorSchema = z
  .string()
  .regex(/^index:\d+$/, "Cursor must be in 'index:<offset>' format");

const activityRouteWithLikeSchema = serializedActivityRouteSchema
  .extend({
    likes_count: z.number().int().nonnegative(),
    has_liked: z.boolean(),
    owner: profileIdentitySchema.nullable().optional(),
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
  })
  .strict();

const deleteRouteOutputSchema = z.object({ success: z.literal(true) }).strict();

const listRoutesSchema = z
  .object({
    search: z.string().optional(),
    min_distance_m: z.number().min(0).optional(),
    max_distance_m: z.number().min(0).optional(),
    min_ascent_m: z.number().min(0).optional(),
    max_ascent_m: z.number().min(0).optional(),
    sort_by: z
      .enum(["newest", "oldest", "distance_desc", "distance_asc", "ascent_desc", "ascent_asc"])
      .optional(),
    limit: z.number().min(1).max(100).default(20),
    cursor: routeCursorSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
    ownerScope: routeOwnerScopeSchema.optional(),
  })
  .strict();

function buildAccessibleRouteCondition(userId: string) {
  return or(
    eq(activityRoutes.profile_id, userId),
    eq(activityRoutes.is_public, true),
    eq(activityRoutes.is_system_template, true),
    sql`exists (
      select 1
      from content_access_grants cag
      where cag.content_type = 'activity_route'
        and cag.content_id = ${activityRoutes.id}
        and cag.grantee_profile_id = ${userId}::uuid
        and cag.access_level = 'read'
        and cag.revoked_at is null
        and (cag.expires_at is null or cag.expires_at > now())
    )`,
  );
}

function buildOwnedRouteCondition(userId: string) {
  return eq(activityRoutes.profile_id, userId);
}

async function requireRouteReadForRow(input: {
  db: ReturnType<typeof getRequiredDb>;
  route: ActivityRouteRow;
  userId: string;
}) {
  await createContentAccessPermissions(input.db).requireReadForRow({
    actorProfileId: input.userId,
    resource: { type: "activity_route", id: input.route.id },
    row: {
      ownerProfileId: input.route.profile_id,
      isPublic: input.route.is_public,
      isSystem: input.route.is_system_template,
    },
    message: "Route not found",
  });
}

async function requireRouteGeometryForRow(input: {
  db: ReturnType<typeof getRequiredDb>;
  route: ActivityRouteRow;
  userId: string;
}) {
  const row = {
    ownerProfileId: input.route.profile_id,
    isPublic: input.route.is_public,
    isSystem: input.route.is_system_template,
  };

  if (row.ownerProfileId === input.userId || row.isPublic === true || row.isSystem === true) {
    return;
  }

  await createContentAccessPermissions(input.db).requireRouteGeometry(
    input.userId,
    input.route.id,
    "Route not found",
  );
}

const uploadRouteSchema = z
  .object({
    name: routeNameSchema,
    description: routeDescriptionSchema,
    fileContent: z
      .string()
      .min(1)
      .refine(
        (content) => getRouteContentSizeBytes(content) <= MAX_ROUTE_FILE_SIZE_BYTES,
        "Route file exceeds the 10 MiB limit",
      ),
    fileName: safeRouteFileNameSchema,
  })
  .strict();

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
      const ownerScope = input.ownerScope ?? "all";
      const visibilityCondition =
        ownerScope === "own"
          ? buildOwnedRouteCondition(ctx.session.user.id)
          : ownerScope === "system"
            ? eq(activityRoutes.is_system_template, true)
            : ownerScope === "public"
              ? eq(activityRoutes.is_public, true)
              : buildAccessibleRouteCondition(ctx.session.user.id);

      if (!visibilityCondition) {
        throw new Error("Failed to build route visibility condition");
      }

      const conditions = [visibilityCondition];

      const trimmedSearch = input.search?.trim();

      if (trimmedSearch) {
        const searchPattern = `%${trimmedSearch}%`;
        const searchCondition = or(
          ilike(activityRoutes.name, searchPattern),
          ilike(activityRoutes.description, searchPattern),
        );
        if (searchCondition) conditions.push(searchCondition);
      }

      if (typeof input.min_distance_m === "number") {
        conditions.push(gte(activityRoutes.total_distance, input.min_distance_m));
      }

      if (typeof input.max_distance_m === "number") {
        conditions.push(lte(activityRoutes.total_distance, input.max_distance_m));
      }

      if (typeof input.min_ascent_m === "number") {
        conditions.push(gte(activityRoutes.total_ascent, input.min_ascent_m));
      }

      if (typeof input.max_ascent_m === "number") {
        conditions.push(lte(activityRoutes.total_ascent, input.max_ascent_m));
      }

      const offsetCursor = input.cursor?.startsWith("index:")
        ? Number.parseInt(input.cursor.slice(6), 10)
        : input.sort_by
          ? 0
          : null;

      const sortOrder =
        input.sort_by === "oldest"
          ? [asc(activityRoutes.created_at), asc(activityRoutes.id)]
          : input.sort_by === "distance_desc"
            ? [
                desc(activityRoutes.total_distance),
                desc(activityRoutes.created_at),
                asc(activityRoutes.id),
              ]
            : input.sort_by === "distance_asc"
              ? [
                  asc(activityRoutes.total_distance),
                  desc(activityRoutes.created_at),
                  asc(activityRoutes.id),
                ]
              : input.sort_by === "ascent_desc"
                ? [
                    desc(activityRoutes.total_ascent),
                    desc(activityRoutes.created_at),
                    asc(activityRoutes.id),
                  ]
                : input.sort_by === "ascent_asc"
                  ? [
                      asc(activityRoutes.total_ascent),
                      desc(activityRoutes.created_at),
                      asc(activityRoutes.id),
                    ]
                  : [desc(activityRoutes.created_at), asc(activityRoutes.id)];

      const rows =
        offsetCursor !== null
          ? await db
              .select()
              .from(activityRoutes)
              .where(and(...conditions))
              .orderBy(...sortOrder)
              .limit(limit + 1)
              .offset(offsetCursor)
          : await db
              .select()
              .from(activityRoutes)
              .where(and(...conditions))
              .orderBy(...sortOrder)
              .limit(limit + 1);

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const items = pageRows.map(serializeActivityRouteRow);

      let nextCursor: string | undefined;
      if (hasMore && pageRows.length > 0) {
        nextCursor = `index:${(offsetCursor ?? 0) + limit}`;
      }

      const routeIds = items.map((route) => route.id);
      const [likeStats, profileIdentityMap] = await Promise.all([
        loadLikeStats(db, {
          entityType: "route",
          entityIds: routeIds,
          viewerProfileId: ctx.session.user.id,
        }),
        loadProfileIdentityMap(
          db,
          items.map((route) => route.profile_id),
        ),
      ]);

      return {
        items: items.map((route) =>
          activityRouteWithLikeSchema.parse({
            ...route,
            ...getLikeStats(likeStats, route.id),
            owner: route.profile_id ? (profileIdentityMap.get(route.profile_id) ?? null) : null,
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
        .where(eq(activityRoutes.id, input.id))
        .limit(1);

      if (!route) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route not found",
        });
      }

      await requireRouteReadForRow({ db, route, userId: ctx.session.user.id });

      const [likeStats, profileIdentityMap] = await Promise.all([
        loadLikeStats(db, {
          entityType: "route",
          entityIds: [input.id],
          viewerProfileId: ctx.session.user.id,
        }),
        loadProfileIdentityMap(db, [route.profile_id]),
      ]);

      return activityRouteWithLikeSchema.parse({
        ...serializeActivityRouteRow(route),
        ...getLikeStats(likeStats, input.id),
        owner: route.profile_id ? (profileIdentityMap.get(route.profile_id) ?? null) : null,
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
        .where(eq(activityRoutes.id, input.id))
        .limit(1);

      if (!routeData) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route not found",
        });
      }

      await requireRouteGeometryForRow({ db, route: routeData, userId: ctx.session.user.id });

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
      let parsed: ReturnType<typeof parseStoredRouteFile>;

      try {
        parsed = parseStoredRouteFile(fileContent, routeData.file_path);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stored route file contained invalid route data",
        });
      }

      return loadFullRouteOutputSchema.parse({
        id: routeData.id,
        name: routeData.name,
        coordinates: parsed.coordinates,
        totalDistance: routeData.total_distance,
        totalAscent: routeData.total_ascent,
        totalDescent: routeData.total_descent,
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
        const artifacts = buildRouteFileArtifacts(input.fileContent, input.fileName);

        // Generate unique file path
        const storageFormat = getCanonicalRouteStorageFormat(artifacts.format);
        const routeId = randomUUID();
        const correlationId = `route-upload:${routeId}`;
        const filePath = `${ctx.session.user.id}/${routeId}.${storageFormat.extension}`;

        const { error: uploadError } = await storageService.storage
          .from(ROUTES_BUCKET)
          .upload(filePath, input.fileContent, {
            contentType: storageFormat.mimeType,
            upsert: false,
          });

        if (uploadError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to upload route file",
          });
        }

        try {
          const [routeData] = await db
            .insert(activityRoutes)
            .values({
              id: routeId,
              created_at: new Date(),
              updated_at: new Date(),
              profile_id: ctx.session.user.id,
              name: input.name,
              description: input.description,
              file_path: filePath,
              total_distance: artifacts.totalDistance,
              total_ascent: artifacts.totalAscent,
              total_descent: artifacts.totalDescent,
              polyline: artifacts.polyline,
              elevation_polyline: artifacts.elevationPolyline,
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
        } catch {
          // Cleanup: delete uploaded file if database insert fails
          try {
            const { error: cleanupError } = await storageService.storage
              .from(ROUTES_BUCKET)
              .remove([filePath]);
            if (cleanupError) {
              logger.error("Route upload cleanup failed", {
                event: "route_upload_cleanup_failed",
                bucket: ROUTES_BUCKET,
                path: filePath,
                correlationId,
                routeId,
                failureKind: "storage_error_result",
              });
            }
          } catch {
            logger.error("Route upload cleanup failed", {
              event: "route_upload_cleanup_failed",
              bucket: ROUTES_BUCKET,
              path: filePath,
              correlationId,
              routeId,
              failureKind: "storage_exception",
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save route",
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid route file",
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

      const [eventsCountRows, groupEventsCountRows] = await Promise.all([
        db.select({ value: count() }).from(events).where(eq(events.route_id, input.id)),
        db.select({ value: count() }).from(groupEvents).where(eq(groupEvents.route_id, input.id)),
      ]);

      const linkedEventsCount =
        (eventsCountRows[0]?.value ?? 0) + (groupEventsCountRows[0]?.value ?? 0);

      if (linkedEventsCount > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Cannot delete route because it is used by ${linkedEventsCount} event${linkedEventsCount > 1 ? "s" : ""}. Please remove the route from those events first.`,
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
