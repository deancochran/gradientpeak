/**
 * Onboarding Router
 *
 * Handles the smart onboarding flow that derives activity_efforts and profile_metrics
 * from minimal user input. Supports experience-based paths:
 * - Beginner: Auto-apply conservative defaults
 * - Intermediate: Validate estimates
 * - Advanced: Manual entry
 * - Skip: Minimal setup
 */

// Import calculation functions directly - they're exported from core package
import {
  calculateAgeFromDOB,
  calculateVO2MaxFromHR,
  estimateCSSFromGender,
  estimateFTPFromWeight,
  estimateLTHR,
  estimateMaxHRFromAge,
  estimateThresholdPaceFromGender,
  getBaselineProfile,
} from "@repo/core";
import {
  completeOnboardingSchema,
  estimateMetricsInputSchema,
  estimateMetricsOutputSchema,
} from "@repo/core/schemas/onboarding";
import { activities, profiles } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  batchInsertActivityEfforts,
  batchInsertProfileMetrics,
  deriveEffortsForSport,
  prepareProfileMetrics,
} from "../utils/onboarding-helpers";

const completeOnboardingOutputSchema = z
  .object({
    success: z.literal(true),
    created: z
      .object({
        profile_metrics: z.number().int().nonnegative(),
        activity_efforts: z.number().int().nonnegative(),
      })
      .strict(),
    baseline_used: z.boolean(),
    confidence: z.enum(["high", "medium", "low"]),
    warnings: z.array(z.string()),
  })
  .strict();

const estimateMetricsQueryInputSchema = estimateMetricsInputSchema.strict();

const estimateMetricsQueryOutputSchema = estimateMetricsOutputSchema.strict();

export const onboardingRouter = createTRPCRouter({
  /**
   * Complete onboarding with smart derivations.
   *
   * Creates profile_metrics and activity_efforts from minimal input.
   * Supports experience-based baseline profiles for beginners and intermediate users.
   *
   * @example
   * // Beginner: Auto-apply defaults
   * completeOnboarding({
   *   experience_level: 'beginner',
   *   dob: '1990-01-01',
   *   weight_kg: 70,
   *   gender: 'male',
   *   primary_sport: 'cycling'
   * })
   * // Returns: 16 records created (5 metrics + 10 efforts + 1 profile update)
   *
   * @example
   * // Advanced: Manual entry
   * completeOnboarding({
   *   experience_level: 'advanced',
   *   dob: '1990-01-01',
   *   weight_kg: 70,
   *   gender: 'male',
   *   primary_sport: 'triathlon',
   *   ftp: 250,
   *   threshold_pace_seconds_per_km: 270,
   *   max_hr: 190,
   *   resting_hr: 55
   * })
   * // Returns: 26 records created (5 metrics + 20 efforts + 1 profile update)
   */
  completeOnboarding: protectedProcedure
    .input(completeOnboardingSchema)
    .output(completeOnboardingOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const userId = ctx.session.user.id;

      // Calculate age from DOB (default to 30 if missing for calculations ONLY)
      // DO NOT use this default for saving to the profile.
      const ageForBaseline = input.dob ? calculateAgeFromDOB(input.dob) : 30;

      // Determine if we have enough info for a baseline profile
      // We need at least gender and weight for most calculations
      // If the user skipped these, we cannot generate a reliable baseline
      const canGenerateBaseline =
        input.experience_level !== "skip" &&
        input.experience_level !== "advanced" &&
        input.weight_kg !== undefined &&
        input.gender !== undefined;

      const baseline = canGenerateBaseline
        ? getBaselineProfile(
            input.experience_level,
            input.weight_kg!, // asserted by canGenerateBaseline
            input.gender!, // asserted by canGenerateBaseline
            ageForBaseline,
            "other",
          )
        : null;

      // 1. Update profiles table - ONLY with provided values.
      try {
        const profileUpdate = {
          dob: input.dob ? new Date(input.dob) : undefined,
          gender: input.gender,
          onboarded: true,
          updated_at: new Date(),
        };

        if (Object.values(profileUpdate).some((value) => value !== undefined)) {
          const [updatedProfile] = await db
            .update(profiles)
            .set(profileUpdate)
            .where(eq(profiles.id, userId))
            .returning({ id: profiles.id });

          if (!updatedProfile?.id) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Profile not found",
            });
          }
        } else {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update profile during onboarding",
          cause: error,
        });
      }

      // 2. Prepare and insert profile metrics
      const metrics = prepareProfileMetrics(
        {
          weight_kg: input.weight_kg, // Pass undefined if missing, helper handles it
          max_hr: input.max_hr,
          resting_hr: input.resting_hr,
          lthr: input.lthr,
          vo2max: input.vo2max,
        },
        baseline,
      );

      try {
        await batchInsertProfileMetrics(db, userId, metrics);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to insert onboarding metrics",
          cause: error,
        });
      }

      // 3. Derive and insert all activity efforts
      const allEfforts = [];
      const warnings: string[] = [];

      const [latestActivity] = await db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.profile_id, userId))
        .orderBy(desc(activities.started_at))
        .limit(1);

      const fallbackActivityId = latestActivity?.id ?? null;

      // Merge user input with baseline for performance metrics
      const finalFtp = input.ftp ?? baseline?.ftp;
      const finalThresholdPace =
        input.threshold_pace_seconds_per_km ?? baseline?.threshold_pace_seconds_per_km;
      const finalCss =
        input.css_seconds_per_hundred_meters ?? baseline?.css_seconds_per_hundred_meters;

      // Cycling/Triathlon: Derive power curve from FTP
      if (finalFtp) {
        allEfforts.push(...deriveEffortsForSport("cycling", finalFtp));
      }

      // Running/Triathlon: Derive speed curve from threshold pace
      if (finalThresholdPace) {
        allEfforts.push(...deriveEffortsForSport("running", finalThresholdPace));
      }

      // Swimming/Triathlon: Derive swim pace curve from CSS
      if (finalCss) {
        allEfforts.push(...deriveEffortsForSport("swimming", finalCss));
      }

      // Batch insert all derived efforts
      if (allEfforts.length > 0) {
        try {
          await batchInsertActivityEfforts(
            db,
            userId,
            allEfforts,
            input.experience_level,
            fallbackActivityId,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          const isActivityIdNotNullViolation =
            message.includes("activity_id") && message.includes("not-null");

          if (isActivityIdNotNullViolation && !fallbackActivityId) {
            warnings.push(
              "Skipped effort insertion because this environment requires activity_id and no activities exist yet.",
            );
          } else {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to insert onboarding efforts",
              cause: error,
            });
          }
        }
      }

      // 4. Return summary
      return {
        success: true,
        created: {
          profile_metrics: metrics.length,
          activity_efforts: warnings.length > 0 ? 0 : allEfforts.length,
        },
        baseline_used: !!baseline,
        confidence: baseline?.confidence || "high",
        warnings,
      };
    }),

  /**
   * Estimate metrics based on athlete profile.
   *
   * Provides real-time estimates as user fills out onboarding form.
   * Used for showing suggested values and validation.
   *
   * @example
   * estimateMetrics({
   *   weight_kg: 70,
   *   gender: 'male',
   *   age: 30,
   *   experience_level: 'intermediate',
   *   primary_sport: 'cycling'
   * })
   * // Returns: { estimated_ftp: 193, estimated_max_hr: 190, ... }
   */
  estimateMetrics: protectedProcedure
    .input(estimateMetricsQueryInputSchema)
    .output(estimateMetricsQueryOutputSchema)
    .query(async ({ input }) => {
      const experienceLevel = input.experience_level || "intermediate";

      // Calculate heart rate estimates
      const estimatedMaxHR = input.max_hr || estimateMaxHRFromAge(input.age);
      const estimatedRestingHR =
        input.resting_hr ||
        (experienceLevel === "beginner"
          ? input.gender === "male"
            ? 70
            : 75
          : input.gender === "male"
            ? 60
            : 65);

      const estimatedLTHR = estimateLTHR(estimatedMaxHR);
      const estimatedVO2Max = calculateVO2MaxFromHR(estimatedMaxHR, estimatedRestingHR);

      // Calculate performance estimates based on sport
      let estimatedFTP: number | undefined;
      let estimatedThresholdPace: number | undefined;
      let estimatedCSS: number | undefined;

      // Use "intermediate" as default if "skip" is selected
      const effectiveExperienceLevel =
        input.experience_level === "skip" ? "intermediate" : input.experience_level;

      estimatedFTP = estimateFTPFromWeight(input.weight_kg, input.gender, effectiveExperienceLevel);

      estimatedThresholdPace = estimateThresholdPaceFromGender(
        input.gender,
        effectiveExperienceLevel,
      );

      estimatedCSS = estimateCSSFromGender(input.gender, effectiveExperienceLevel);

      return {
        estimated_max_hr: estimatedMaxHR,
        estimated_resting_hr: estimatedRestingHR,
        estimated_lthr: estimatedLTHR,
        estimated_vo2max: estimatedVO2Max,
        estimated_ftp: estimatedFTP,
        estimated_threshold_pace: estimatedThresholdPace,
        estimated_css: estimatedCSS,
        confidence: experienceLevel === "beginner" ? ("low" as const) : ("medium" as const),
      };
    }),
});
