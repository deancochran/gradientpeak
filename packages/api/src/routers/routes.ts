import { createHash } from "node:crypto";
import {
  MAX_ROUTE_FILE_SIZE_BYTES,
  MAX_ROUTE_LIST_OFFSET,
  routeDescriptionSchema,
  routeNameSchema,
  safeRouteFileNameSchema,
} from "@repo/core/route-files";
import {
  type ActivityRouteRow,
  activityRouteDeletionReceipts,
  activityRoutes,
  comments,
  events,
  groupEvents,
  likes,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  serializeActivityRouteRow,
  serializedActivityRouteSchema,
} from "../application/routes/serializeActivityRouteRow";
import { getRequiredDb } from "../db";
import { logger } from "../lib/logger";
import { enqueueWahooOwnedRouteMirror } from "../lib/provider-sync/owned-routes";
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
  .regex(/^index:\d+$/, "Cursor must be in 'index:<offset>' format")
  .refine((cursor) => {
    const offset = Number(cursor.slice(6));
    return Number.isSafeInteger(offset) && offset <= MAX_ROUTE_LIST_OFFSET;
  }, `Cursor offset must not exceed ${MAX_ROUTE_LIST_OFFSET}`);

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
    idempotencyKey: routeIdSchema,
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

const updateRouteSchema = z
  .object({
    id: routeIdSchema,
    // The shared upload schema normalizes omission to null. The outer optional preserves
    // omission for PATCH-like updates so a name-only edit cannot clear the description.
    description: routeDescriptionSchema.optional(),
    name: routeNameSchema.optional(),
  })
  .strict()
  .refine((input) => input.name !== undefined || input.description !== undefined, {
    message: "Route update must include a name or description",
  });

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

      const conditions = [visibilityCondition, eq(activityRoutes.storage_state, "ready")];

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

      if (route.storage_state !== "ready" && route.profile_id !== ctx.session.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Route not found" });
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

      if (routeData.storage_state !== "ready") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Route geometry is unavailable" });
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
      const downloadedSha256 = createHash("sha256").update(fileContent, "utf8").digest("hex");
      if (!routeData.file_sha256 || downloadedSha256 !== routeData.file_sha256) {
        logger.error("Route file integrity check failed", {
          event: "route_storage_integrity_failed",
          path: routeData.file_path,
          routeId: routeData.id,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stored route file failed its integrity check",
        });
      }
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
      const db = getRequiredDb(ctx);
      let artifacts: ReturnType<typeof buildRouteFileArtifacts>;
      try {
        artifacts = buildRouteFileArtifacts(input.fileContent, input.fileName);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid route file",
        });
      }

      const storageFormat = getCanonicalRouteStorageFormat(artifacts.format);
      const routeId = input.idempotencyKey;
      const filePath = `${ctx.session.user.id}/${routeId}.${storageFormat.extension}`;
      const fileSha256 = createHash("sha256").update(input.fileContent, "utf8").digest("hex");
      const matchesUpload = (route: ActivityRouteRow) =>
        route.profile_id === ctx.session.user.id &&
        route.name === input.name &&
        route.description === input.description &&
        route.file_path === filePath &&
        route.file_sha256 === fileSha256 &&
        route.polyline === artifacts.polyline &&
        route.elevation_polyline === artifacts.elevationPolyline &&
        route.total_distance === artifacts.totalDistance &&
        route.total_ascent === artifacts.totalAscent &&
        route.total_descent === artifacts.totalDescent;

      let routeData: ActivityRouteRow | undefined;
      [routeData] = await db
        .select()
        .from(activityRoutes)
        .where(eq(activityRoutes.id, routeId))
        .limit(1);

      if (!routeData) {
        const claimedAt = new Date();
        try {
          [routeData] = await db
            .insert(activityRoutes)
            .values({
              created_at: claimedAt,
              description: input.description,
              elevation_polyline: artifacts.elevationPolyline,
              file_path: filePath,
              file_sha256: fileSha256,
              id: routeId,
              is_public: false,
              name: input.name,
              polyline: artifacts.polyline,
              profile_id: ctx.session.user.id,
              storage_state: "upload_pending",
              total_ascent: artifacts.totalAscent,
              total_descent: artifacts.totalDescent,
              total_distance: artifacts.totalDistance,
              updated_at: claimedAt,
            })
            .returning();
        } catch {
          try {
            [routeData] = await db
              .select()
              .from(activityRoutes)
              .where(eq(activityRoutes.id, routeId))
              .limit(1);
          } catch {
            routeData = undefined;
          }
        }
      }
      if (!routeData) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to prepare route upload; retry with the same file",
        });
      }
      if (!matchesUpload(routeData)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Upload request conflicts with an existing route",
        });
      }
      if (routeData.storage_state === "ready") return serializeActivityRouteRow(routeData);
      if (routeData.storage_state === "deletion_pending") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Route deletion is already in progress",
        });
      }

      const { error: uploadError } = await storageService.storage
        .from(ROUTES_BUCKET)
        .upload(filePath, input.fileContent, {
          contentType: storageFormat.mimeType,
          upsert: true,
        });
      if (uploadError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload route file; retry with the same file",
        });
      }

      try {
        const readyRoute = await db.transaction(async (tx) => {
          const updatedAt = new Date();
          const [updated] = await tx
            .update(activityRoutes)
            .set({ storage_state: "ready", updated_at: updatedAt })
            .where(
              and(
                eq(activityRoutes.id, routeId),
                eq(activityRoutes.profile_id, ctx.session.user.id),
                eq(activityRoutes.storage_state, "upload_pending"),
              ),
            )
            .returning();
          if (!updated) {
            const [current] = await tx
              .select()
              .from(activityRoutes)
              .where(
                and(
                  eq(activityRoutes.id, routeId),
                  eq(activityRoutes.profile_id, ctx.session.user.id),
                ),
              )
              .limit(1);
            if (current?.storage_state === "ready" && matchesUpload(current)) return current;
            throw new Error("route_upload_claim_not_pending");
          }
          await enqueueWahooOwnedRouteMirror({
            db,
            expectedRouteUpdatedAt: updatedAt.toISOString(),
            operation: "upsert",
            profileId: ctx.session.user.id,
            routeId,
            transaction: tx,
          });
          return updated;
        });
        return serializeActivityRouteRow(readyRoute);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Route upload is stored but not finalized; retry with the same file",
        });
      }
    }),

  update: protectedProcedure
    .input(updateRouteSchema)
    .output(serializedActivityRouteSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const updatedRoute = await db.transaction(async (tx) => {
        const [owned] = await tx
          .select({ id: activityRoutes.id })
          .from(activityRoutes)
          .where(
            and(
              eq(activityRoutes.id, input.id),
              eq(activityRoutes.profile_id, ctx.session.user.id),
              eq(activityRoutes.storage_state, "ready"),
            ),
          )
          .for("update")
          .limit(1);
        if (!owned) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Route not found or you don't have permission to update it",
          });
        }
        const updatedAt = new Date();
        const [updated] = await tx
          .update(activityRoutes)
          .set({
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            updated_at: updatedAt,
          })
          .where(
            and(
              eq(activityRoutes.id, input.id),
              eq(activityRoutes.profile_id, ctx.session.user.id),
            ),
          )
          .returning();
        if (!updated) throw new Error("route_update_failed");
        await enqueueWahooOwnedRouteMirror({
          db,
          expectedRouteUpdatedAt: updatedAt.toISOString(),
          operation: "upsert",
          profileId: ctx.session.user.id,
          routeId: input.id,
          transaction: tx,
        });
        return updated;
      });
      return serializeActivityRouteRow(updatedRoute);
    }),

  // ------------------------------
  // Delete route
  // ------------------------------
  delete: protectedProcedure
    .input(z.object({ id: routeIdSchema }).strict())
    .output(deleteRouteOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const deletionClaim = await db.transaction(async (tx) => {
        const [route] = await tx
          .select()
          .from(activityRoutes)
          .where(
            and(
              eq(activityRoutes.id, input.id),
              eq(activityRoutes.profile_id, ctx.session.user.id),
            ),
          )
          .for("update")
          .limit(1);
        if (!route) {
          const [receipt] = await tx
            .select({ routeId: activityRouteDeletionReceipts.route_id })
            .from(activityRouteDeletionReceipts)
            .where(
              and(
                eq(activityRouteDeletionReceipts.route_id, input.id),
                eq(activityRouteDeletionReceipts.profile_id, ctx.session.user.id),
              ),
            )
            .limit(1);
          if (receipt) return null;
          throw new TRPCError({ code: "NOT_FOUND", message: "Route not found" });
        }
        if (route.storage_state === "upload_pending") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Route upload must finish before it can be deleted",
          });
        }
        const [eventsCountRows] = await tx
          .select({ value: count() })
          .from(events)
          .where(eq(events.route_id, input.id));
        const [groupEventsCountRows] = await tx
          .select({ value: count() })
          .from(groupEvents)
          .where(eq(groupEvents.route_id, input.id));
        const linkedEventsCount =
          (eventsCountRows?.value ?? 0) + (groupEventsCountRows?.value ?? 0);
        if (linkedEventsCount > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Cannot delete route because it is used by ${linkedEventsCount} event${linkedEventsCount > 1 ? "s" : ""}. Please remove the route from those events first.`,
          });
        }
        if (route.storage_state === "ready") {
          const [pendingRoute] = await tx
            .update(activityRoutes)
            .set({ storage_state: "deletion_pending", updated_at: new Date() })
            .where(
              and(
                eq(activityRoutes.id, input.id),
                eq(activityRoutes.profile_id, ctx.session.user.id),
                eq(activityRoutes.storage_state, "ready"),
              ),
            )
            .returning();
          if (!pendingRoute) throw new Error("route_deletion_claim_failed");
          return pendingRoute;
        }
        return route;
      });

      if (!deletionClaim) return deleteRouteOutputSchema.parse({ success: true });

      const deletionContext = {
        event: "route_storage_deletion_failed",
        bucket: ROUTES_BUCKET,
        path: deletionClaim.file_path,
        correlationId: `route-delete:${input.id}`,
        routeId: input.id,
      };
      try {
        const { error } = await storageService.storage
          .from(ROUTES_BUCKET)
          .remove([deletionClaim.file_path]);
        if (error) {
          logger.error("Route storage deletion failed", {
            ...deletionContext,
            failureKind: "storage_error_result",
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Route file deletion is pending; retry route deletion",
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error("Route storage deletion failed", {
          ...deletionContext,
          failureKind: "storage_exception",
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Route file deletion is pending; retry route deletion",
        });
      }

      await db.transaction(async (tx) => {
        const [deletedRoute] = await tx
          .delete(activityRoutes)
          .where(
            and(
              eq(activityRoutes.id, input.id),
              eq(activityRoutes.profile_id, ctx.session.user.id),
              eq(activityRoutes.storage_state, "deletion_pending"),
            ),
          )
          .returning({ id: activityRoutes.id });
        if (!deletedRoute) return;
        await enqueueWahooOwnedRouteMirror({
          db,
          operation: "delete",
          profileId: ctx.session.user.id,
          routeId: input.id,
          transaction: tx,
        });
        await tx
          .delete(likes)
          .where(and(eq(likes.entity_id, input.id), eq(likes.entity_type, "route")));
        await tx
          .delete(comments)
          .where(and(eq(comments.entity_id, input.id), eq(comments.entity_type, "route")));
        await tx.insert(activityRouteDeletionReceipts).values({
          deleted_at: new Date(),
          file_path: deletionClaim.file_path,
          profile_id: ctx.session.user.id,
          route_id: input.id,
        });
      });

      return deleteRouteOutputSchema.parse({ success: true });
    }),
});
