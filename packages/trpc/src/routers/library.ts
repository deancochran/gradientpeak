import { libraryItemCreateSchema } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const listLibraryItemsInputSchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
    visibility: z.enum(["private", "public"]).optional(),
    owner_scope: z.enum(["own", "system", "public", "all"]).optional(),
  })
  .strict();

function parseCursor(
  cursor?: string,
): { createdAt: string; id: string } | null {
  if (!cursor) return null;

  const separatorIndex = cursor.lastIndexOf("_");
  if (separatorIndex <= 0 || separatorIndex >= cursor.length - 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid cursor",
    });
  }

  return {
    createdAt: cursor.slice(0, separatorIndex),
    id: cursor.slice(separatorIndex + 1),
  };
}

function getTemplateVisibility(row: {
  template_visibility?: string | null;
  is_system_template?: boolean | null;
}) {
  if (
    row.template_visibility === "private" ||
    row.template_visibility === "public"
  ) {
    return row.template_visibility;
  }
  return row.is_system_template ? "public" : "private";
}

async function ensureLibraryTargetAccessible(input: {
  supabase: any;
  profileId: string;
  itemType: "training_plan" | "activity_plan";
  itemId: string;
}) {
  const table =
    input.itemType === "training_plan" ? "training_plans" : "activity_plans";
  const { data, error } = await input.supabase
    .from(table)
    .select("id")
    .eq("id", input.itemId)
    .or(
      `profile_id.eq.${input.profileId},is_system_template.eq.true,template_visibility.eq.public`,
    )
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Template not found or not accessible",
    });
  }
}

export const libraryRouter = createTRPCRouter({
  add: protectedProcedure
    .input(libraryItemCreateSchema)
    .mutation(async ({ ctx, input }) => {
      await ensureLibraryTargetAccessible({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        itemType: input.item_type,
        itemId: input.item_id,
      });

      const { data, error } = await ctx.supabase
        .from("library_items")
        .upsert(
          {
            profile_id: ctx.session.user.id,
            item_type: input.item_type,
            item_id: input.item_id,
          },
          { onConflict: "profile_id,item_type,item_id" },
        )
        .select("*")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error?.message ?? "Failed to add library item",
        });
      }

      return {
        ...data,
        cache_tags: ["library.listTrainingPlans", "library.listActivityPlans"],
      };
    }),

  remove: protectedProcedure
    .input(libraryItemCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("library_items")
        .delete()
        .eq("profile_id", ctx.session.user.id)
        .eq("item_type", input.item_type)
        .eq("item_id", input.item_id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return {
        success: true,
        cache_tags: ["library.listTrainingPlans", "library.listActivityPlans"],
      };
    }),

  listTrainingPlans: protectedProcedure
    .input(listLibraryItemsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const profileId = ctx.session.user.id;
      const limit = input?.limit ?? 20;
      const cursor = parseCursor(input?.cursor);

      let pointersQuery = ctx.supabase
        .from("library_items")
        .select("id,item_id,created_at")
        .eq("profile_id", profileId)
        .eq("item_type", "training_plan")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(limit + 1);

      if (cursor) {
        pointersQuery = pointersQuery.or(
          `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
        );
      }

      const { data: pointerRows, error: pointerError } = await pointersQuery;

      if (pointerError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: pointerError.message,
        });
      }

      const hasMore = (pointerRows?.length ?? 0) > limit;
      const pointers = hasMore
        ? (pointerRows ?? []).slice(0, limit)
        : (pointerRows ?? []);
      const pointerByItemId = new Map(
        pointers.map((row: any) => [row.item_id, row]),
      );
      const itemIds = pointers.map((row: any) => row.item_id);

      if (itemIds.length === 0) {
        return {
          items: [],
          nextCursor: undefined,
        };
      }

      let plansQuery = ctx.supabase
        .from("training_plans")
        .select("*")
        .in("id", itemIds);

      if (input?.owner_scope === "own") {
        plansQuery = plansQuery.eq("profile_id", profileId);
      } else if (input?.owner_scope === "system") {
        plansQuery = plansQuery.eq("is_system_template", true);
      } else if (input?.owner_scope === "public") {
        plansQuery = plansQuery
          .eq("template_visibility", "public")
          .neq("profile_id", profileId);
      } else {
        plansQuery = plansQuery.or(
          `profile_id.eq.${profileId},is_system_template.eq.true,template_visibility.eq.public`,
        );
      }

      if (input?.visibility) {
        plansQuery = plansQuery.eq("template_visibility", input.visibility);
      }

      const { data: plans, error: plansError } = await plansQuery;
      if (plansError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: plansError.message,
        });
      }

      const planById = new Map((plans ?? []).map((row: any) => [row.id, row]));
      const items = itemIds
        .map((id) => planById.get(id))
        .filter((row): row is Record<string, any> => Boolean(row))
        .map((row) => ({
          content_type: "training_plan" as const,
          content_id: row.id,
          owner_profile_id: row.profile_id,
          visibility: getTemplateVisibility(row),
          raw: row,
          library_item_id: pointerByItemId.get(row.id)?.id,
          saved_at: pointerByItemId.get(row.id)?.created_at,
        }));

      const lastPointer = pointers[pointers.length - 1] as
        | { created_at: string; id: string }
        | undefined;

      return {
        items,
        nextCursor:
          hasMore && lastPointer
            ? `${lastPointer.created_at}_${lastPointer.id}`
            : undefined,
      };
    }),

  listActivityPlans: protectedProcedure
    .input(listLibraryItemsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const profileId = ctx.session.user.id;
      const limit = input?.limit ?? 20;
      const cursor = parseCursor(input?.cursor);

      let pointersQuery = ctx.supabase
        .from("library_items")
        .select("id,item_id,created_at")
        .eq("profile_id", profileId)
        .eq("item_type", "activity_plan")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(limit + 1);

      if (cursor) {
        pointersQuery = pointersQuery.or(
          `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
        );
      }

      const { data: pointerRows, error: pointerError } = await pointersQuery;

      if (pointerError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: pointerError.message,
        });
      }

      const hasMore = (pointerRows?.length ?? 0) > limit;
      const pointers = hasMore
        ? (pointerRows ?? []).slice(0, limit)
        : (pointerRows ?? []);
      const pointerByItemId = new Map(
        pointers.map((row: any) => [row.item_id, row]),
      );
      const itemIds = pointers.map((row: any) => row.item_id);

      if (itemIds.length === 0) {
        return {
          items: [],
          nextCursor: undefined,
        };
      }

      let plansQuery = ctx.supabase
        .from("activity_plans")
        .select("*")
        .in("id", itemIds);

      if (input?.owner_scope === "own") {
        plansQuery = plansQuery.eq("profile_id", profileId);
      } else if (input?.owner_scope === "system") {
        plansQuery = plansQuery.eq("is_system_template", true);
      } else if (input?.owner_scope === "public") {
        plansQuery = plansQuery
          .eq("template_visibility", "public")
          .neq("profile_id", profileId);
      } else {
        plansQuery = plansQuery.or(
          `profile_id.eq.${profileId},is_system_template.eq.true,template_visibility.eq.public`,
        );
      }

      if (input?.visibility) {
        plansQuery = plansQuery.eq("template_visibility", input.visibility);
      }

      const { data: plans, error: plansError } = await plansQuery;
      if (plansError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: plansError.message,
        });
      }

      const planById = new Map((plans ?? []).map((row: any) => [row.id, row]));
      const items = itemIds
        .map((id) => planById.get(id))
        .filter((row): row is Record<string, any> => Boolean(row))
        .map((row) => ({
          content_type: "activity_plan" as const,
          content_id: row.id,
          owner_profile_id: row.profile_id,
          visibility: getTemplateVisibility(row),
          raw: row,
          library_item_id: pointerByItemId.get(row.id)?.id,
          saved_at: pointerByItemId.get(row.id)?.created_at,
        }));

      const lastPointer = pointers[pointers.length - 1] as
        | { created_at: string; id: string }
        | undefined;

      return {
        items,
        nextCursor:
          hasMore && lastPointer
            ? `${lastPointer.created_at}_${lastPointer.id}`
            : undefined,
      };
    }),
});
