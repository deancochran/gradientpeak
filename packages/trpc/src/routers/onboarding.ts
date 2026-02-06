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

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  completeOnboardingSchema,
  estimateMetricsInputSchema,
  type Sport,
} from "@repo/core/schemas/onboarding";
import {
  batchInsertProfileMetrics,
  batchInsertActivityEfforts,
  deriveEffortsForSport,
  prepareProfileMetrics,
} from "../utils/onboarding-helpers";
// Import calculation functions directly - they're exported from core package
import {
  calculateAgeFromDOB,
  getBaselineProfile,
  estimateMaxHRFromAge,
  estimateLTHR,
  calculateVO2MaxFromHR,
  estimateFTPFromWeight,
  estimateThresholdPaceFromGender,
  estimateCSSFromGender,
} from "@repo/core";

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
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;
      const userId = session.user.id;

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

      // 1. Update profiles table - ONLY with provided values
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          ...(input.dob ? { dob: input.dob } : {}),
          ...(input.gender ? { gender: input.gender } : {}),
          onboarded: true,
        })
        .eq("id", userId);

      if (profileError) {
        throw new Error(`Failed to update profile: ${profileError.message}`);
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

      const { error: metricsError } = await batchInsertProfileMetrics(
        supabase,
        userId,
        metrics,
      );

      if (metricsError) {
        throw new Error(`Failed to insert metrics: ${metricsError.message}`);
      }

      // 3. Derive and insert all activity efforts
      const allEfforts = [];

      // Merge user input with baseline for performance metrics
      const finalFtp = input.ftp ?? baseline?.ftp;
      const finalThresholdPace =
        input.threshold_pace_seconds_per_km ??
        baseline?.threshold_pace_seconds_per_km;
      const finalCss =
        input.css_seconds_per_hundred_meters ??
        baseline?.css_seconds_per_hundred_meters;

      // Cycling/Triathlon: Derive power curve from FTP
      if (finalFtp) {
        allEfforts.push(...deriveEffortsForSport("cycling", finalFtp));
      }

      // Running/Triathlon: Derive speed curve from threshold pace
      if (finalThresholdPace) {
        allEfforts.push(
          ...deriveEffortsForSport("running", finalThresholdPace),
        );
      }

      // Swimming/Triathlon: Derive swim pace curve from CSS
      if (finalCss) {
        allEfforts.push(...deriveEffortsForSport("swimming", finalCss));
      }

      // Batch insert all derived efforts
      if (allEfforts.length > 0) {
        const { error: effortsError } = await batchInsertActivityEfforts(
          supabase,
          userId,
          allEfforts,
          input.experience_level,
        );

        if (effortsError) {
          throw new Error(`Failed to insert efforts: ${effortsError.message}`);
        }
      }

      // 4. Return summary
      return {
        success: true,
        created: {
          profile_metrics: metrics.length,
          activity_efforts: allEfforts.length,
        },
        baseline_used: !!baseline,
        confidence: baseline?.confidence || "high",
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
    .input(estimateMetricsInputSchema)
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
      const estimatedVO2Max = calculateVO2MaxFromHR(
        estimatedMaxHR,
        estimatedRestingHR,
      );

      // Calculate performance estimates based on sport
      let estimatedFTP: number | undefined;
      let estimatedThresholdPace: number | undefined;
      let estimatedCSS: number | undefined;

      // Use "intermediate" as default if "skip" is selected
      const effectiveExperienceLevel =
        input.experience_level === "skip"
          ? "intermediate"
          : input.experience_level;

      estimatedFTP = estimateFTPFromWeight(
        input.weight_kg,
        input.gender,
        effectiveExperienceLevel,
      );

      estimatedThresholdPace = estimateThresholdPaceFromGender(
        input.gender,
        effectiveExperienceLevel,
      );

      estimatedCSS = estimateCSSFromGender(
        input.gender,
        effectiveExperienceLevel,
      );

      return {
        estimated_max_hr: estimatedMaxHR,
        estimated_resting_hr: estimatedRestingHR,
        estimated_lthr: estimatedLTHR,
        estimated_vo2max: estimatedVO2Max,
        estimated_ftp: estimatedFTP,
        estimated_threshold_pace: estimatedThresholdPace,
        estimated_css: estimatedCSS,
        confidence:
          experienceLevel === "beginner"
            ? ("low" as const)
            : ("medium" as const),
      };
    }),
});
