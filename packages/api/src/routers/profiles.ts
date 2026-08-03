import {
  athletePerformanceOverviewSchema,
  athletePerformanceTargetFactsSchema,
  parseDateOfBirth,
  profilePatchInputSchema,
  projectAthletePerformanceOverview,
  projectAthletePerformanceTargetFacts,
} from "@repo/core";
import { resolveProfileZones } from "@repo/core/zones";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAthletePerformanceModelAsOf } from "../application/performance-model/get-athlete-performance-model-as-of";
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
import { createAthletePerformanceModelRepository } from "../repositories/athlete-performance-model-repository";
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
    next: z.string().nullable(),
  })
  .strict();
const profileMediaCompareAndSwapResultSchema = z.object({ success: z.literal(true) }).strict();
const performanceModelAsOfInputSchema = z.object({ asOf: z.string().datetime() }).strict();

export const profilesRouter = createTRPCRouter({
  getPerformanceModel: protectedProcedure
    .input(performanceModelAsOfInputSchema)
    .output(athletePerformanceOverviewSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const asOf = new Date(input.asOf);
      try {
        const model = await getAthletePerformanceModelAsOf(
          { athleteId: ctx.session.user.id, asOf },
          createAthletePerformanceModelRepository(db),
        );
        return projectAthletePerformanceOverview(model);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch athlete performance overview",
        });
      }
    }),
  getPerformanceTargets: protectedProcedure
    .input(performanceModelAsOfInputSchema)
    .output(athletePerformanceTargetFactsSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const asOf = new Date(input.asOf);
      try {
        const model = await getAthletePerformanceModelAsOf(
          { athleteId: ctx.session.user.id, asOf },
          createAthletePerformanceModelRepository(db),
        );
        return projectAthletePerformanceTargetFacts(model);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch athlete performance targets",
        });
      }
    }),
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

  getZones: protectedProcedure
    .input(z.object({ asOf: z.string().datetime() }).strict())
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        const model = await getAthletePerformanceModelAsOf(
          { athleteId: ctx.session.user.id, asOf: new Date(input.asOf) },
          createAthletePerformanceModelRepository(db),
        );
        const zones = resolveProfileZones(projectAthletePerformanceTargetFacts(model));
        return zones;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get training zones",
        });
      }
    }),
});
