import { parseDateOfBirth, profilePatchInputSchema } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ensureProfileExists,
  getPublicProfileById,
  getSerializedProfile,
} from "../application/profiles/readProfiles";
import {
  ProfileUpdateNotFoundError,
  ProfileUsernameConflictError,
  updateProfile,
} from "../application/profiles/updateProfile";
import { getRequiredDb } from "../db";
import { compareAndSwapOwnedProfileMedia } from "../repositories/profile-update-repository";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const uuidSchema = z.string().uuid();
const nonMediaProfilePatchInputSchema = profilePatchInputSchema
  .omit({ avatar_url: true, cover_url: true })
  .strict();
const profileMediaCompareAndSwapInputSchema = z
  .object({
    field: z.enum(["avatar_url", "cover_url"]),
    expected: z.string().nullable(),
    next: z.string().url().nullable(),
  })
  .strict();
const profileMediaCompareAndSwapResultSchema = z.object({ success: z.literal(true) }).strict();

export const profilesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    try {
      await ensureProfileExists(db, {
        id: ctx.session.user.id,
        email: ctx.session.user.email,
      });

      const profile = await getSerializedProfile(db, ctx.session.user.id);

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found",
        });
      }

      return profile;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch profile",
      });
    }
  }),

  getPublicById: protectedProcedure
    .input(z.object({ id: uuidSchema }).strict())
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        const profile = await getPublicProfileById(db, {
          viewerProfileId: ctx.session.user.id,
          profileId: input.id,
        });

        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
          });
        }

        return profile;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch public profile",
        });
      }
    }),

  update: protectedProcedure
    .input(nonMediaProfilePatchInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        await updateProfile(db, {
          profileId: ctx.session.user.id,
          default_content_visibility: input.default_content_visibility,
          bio: input.bio,
          dob:
            input.dob === undefined
              ? undefined
              : input.dob === null
                ? null
                : parseDateOfBirth(input.dob),
          full_name: input.full_name,
          is_public: input.is_public,
          username: input.username == null ? input.username : input.username.toLowerCase(),
          language: input.language,
          planning_timezone: input.planning_timezone,
          preferred_units: input.preferred_units,
          weight_kg: input.weight_kg,
        });

        const profile = await getSerializedProfile(db, ctx.session.user.id);

        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
          });
        }

        return profile;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        if (error instanceof ProfileUpdateNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof ProfileUsernameConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update profile",
        });
      }
    }),

  compareAndSwapMedia: protectedProcedure
    .input(profileMediaCompareAndSwapInputSchema)
    .output(profileMediaCompareAndSwapResultSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      try {
        const updated = await compareAndSwapOwnedProfileMedia(db, {
          profileId: ctx.session.user.id,
          field: input.field,
          expected: input.expected,
          next: input.next,
          now: new Date(),
        });
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Profile image changed. Please retry.",
          });
        }
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update profile image",
        });
      }
    }),
});
