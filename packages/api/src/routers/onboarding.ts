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
import { calculateAgeFromDOB, getBaselineProfile } from "@repo/core";
import type { DerivedEffort } from "@repo/core/calculations";
import { completeOnboardingSchema } from "@repo/core/schemas/onboarding";
import { publicIntegrationProviderSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  OnboardingProfileNotFoundError,
  persistOnboardingProfile,
} from "../application/onboarding/persist-onboarding-profile";
import { OnboardingProviderEnrichmentService } from "../application/onboarding-provider-enrichment";
import type { Context } from "../context";
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

const providerEnrichmentOverallStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "timed_out",
]);

const providerEnrichmentItemStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "timed_out",
  "skipped_unsupported",
  "requirement_cleared",
]);

const providerEnrichmentStatusOutputSchema = z
  .object({
    status: providerEnrichmentOverallStatusSchema,
    canContinue: z.boolean(),
    providers: z.array(
      z
        .object({
          provider: publicIntegrationProviderSchema,
          status: providerEnrichmentItemStatusSchema,
          blocking: z.boolean(),
          connected: z.boolean(),
          message: z.string().optional(),
          lastSyncStartedAt: z.string().datetime().nullable(),
          lastSyncSucceededAt: z.string().datetime().nullable(),
          lastSyncFailedAt: z.string().datetime().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

const providerEnrichmentStartInputSchema = z
  .object({
    providers: z.array(publicIntegrationProviderSchema).min(1).max(5).optional(),
  })
  .strict()
  .optional();

const clearProviderRequirementInputSchema = z
  .object({
    provider: publicIntegrationProviderSchema,
  })
  .strict();

const importedOnboardingValuesOutputSchema = z
  .object({
    profile: z
      .object({
        dob: z.string().nullable(),
        gender: z.enum(["male", "female", "other"]).nullable(),
        onboarded: z.boolean().nullable(),
      })
      .strict(),
    values: z
      .object({
        dob: z.string().optional(),
        gender: z.enum(["male", "female", "other"]).optional(),
        weight_kg: z.number().optional(),
        ftp: z.number().optional(),
      })
      .strict(),
    sources: z
      .object({
        dob: z
          .object({
            provider: publicIntegrationProviderSchema,
            label: z.string(),
            sourceRecordedAt: z.string().datetime().nullable(),
          })
          .strict()
          .optional(),
        gender: z
          .object({
            provider: publicIntegrationProviderSchema,
            label: z.string(),
            sourceRecordedAt: z.string().datetime().nullable(),
          })
          .strict()
          .optional(),
        weight_kg: z
          .object({
            provider: publicIntegrationProviderSchema,
            label: z.string(),
            sourceRecordedAt: z.string().datetime().nullable(),
          })
          .strict()
          .optional(),
        ftp: z
          .object({
            provider: publicIntegrationProviderSchema,
            label: z.string(),
            sourceRecordedAt: z.string().datetime().nullable(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();

function getOnboardingProviderEnrichmentService(ctx: Context) {
  return new OnboardingProviderEnrichmentService({ db: getRequiredDb(ctx) });
}

export const onboardingRouter = createTRPCRouter({
  startProviderEnrichment: protectedProcedure
    .input(providerEnrichmentStartInputSchema)
    .output(providerEnrichmentStatusOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const service = getOnboardingProviderEnrichmentService(ctx);
      return service.start(ctx.session.user.id, input?.providers);
    }),

  getProviderEnrichmentStatus: protectedProcedure
    .output(providerEnrichmentStatusOutputSchema)
    .query(async ({ ctx }) => {
      const service = getOnboardingProviderEnrichmentService(ctx);
      return service.getStatus(ctx.session.user.id);
    }),

  getImportedOnboardingValues: protectedProcedure
    .output(importedOnboardingValuesOutputSchema)
    .query(async ({ ctx }) => {
      const service = getOnboardingProviderEnrichmentService(ctx);
      return service.getImportedOnboardingValues(ctx.session.user.id);
    }),

  clearProviderRequirement: protectedProcedure
    .input(clearProviderRequirementInputSchema)
    .output(providerEnrichmentStatusOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const service = getOnboardingProviderEnrichmentService(ctx);
      return service.clearProviderRequirement(ctx.session.user.id, input.provider);
    }),

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
      const providerEnrichment = new OnboardingProviderEnrichmentService({ db });

      try {
        await providerEnrichment.assertCanComplete(userId);
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: error instanceof Error ? error.message : "Provider enrichment is still required",
        });
      }

      const importedOnboardingValues = await providerEnrichment.getImportedOnboardingValues(userId);
      const importedProviderFtp =
        importedOnboardingValues.sources.ftp &&
        typeof importedOnboardingValues.values.ftp === "number"
          ? importedOnboardingValues.values.ftp
          : undefined;
      const usesUnchangedProviderFtp =
        importedProviderFtp !== undefined &&
        (input.ftp === undefined || input.ftp === importedProviderFtp);

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

      // Prepare every row before opening the all-or-nothing write transaction.
      const metrics = prepareProfileMetrics(
        {
          weight_kg: input.weight_kg, // Pass undefined if missing, helper handles it
          max_hr: input.max_hr,
          resting_hr: input.resting_hr,
          lthr: input.lthr,
          vo2max: input.vo2max,
          ftp: usesUnchangedProviderFtp ? undefined : input.ftp,
          threshold_pace_seconds_per_km: input.threshold_pace_seconds_per_km,
          css_seconds_per_hundred_meters: input.css_seconds_per_hundred_meters,
        },
        baseline,
      );

      const allEfforts: DerivedEffort[] = [];
      const providerFtpEfforts: DerivedEffort[] = [];
      const otherEfforts: DerivedEffort[] = [];
      const warnings: string[] = [];

      // Merge user input with baseline for performance metrics
      const finalFtp = input.ftp ?? importedProviderFtp ?? baseline?.ftp;
      const finalThresholdPace =
        input.threshold_pace_seconds_per_km ?? baseline?.threshold_pace_seconds_per_km;
      const finalCss =
        input.css_seconds_per_hundred_meters ?? baseline?.css_seconds_per_hundred_meters;

      // Cycling/Triathlon: Derive power curve from FTP
      if (finalFtp) {
        const ftpEfforts = deriveEffortsForSport("cycling", finalFtp);
        allEfforts.push(...ftpEfforts);
        (usesUnchangedProviderFtp ? providerFtpEfforts : otherEfforts).push(...ftpEfforts);
      }

      // Running/Triathlon: Derive speed curve from threshold pace
      if (finalThresholdPace) {
        const runningEfforts = deriveEffortsForSport("running", finalThresholdPace);
        allEfforts.push(...runningEfforts);
        otherEfforts.push(...runningEfforts);
      }

      // Swimming/Triathlon: Derive swim pace curve from CSS
      if (finalCss) {
        const swimmingEfforts = deriveEffortsForSport("swimming", finalCss);
        allEfforts.push(...swimmingEfforts);
        otherEfforts.push(...swimmingEfforts);
      }

      let writeStage: "profile" | "metrics" | "efforts" = "profile";
      try {
        await db.transaction(async (tx) => {
          await persistOnboardingProfile({ tx, profileId: userId, input });

          writeStage = "metrics";
          await batchInsertProfileMetrics(tx, userId, metrics);

          writeStage = "efforts";
          await batchInsertActivityEfforts(tx, userId, otherEfforts, input.experience_level);
          await batchInsertActivityEfforts(tx, userId, providerFtpEfforts, "provider_wahoo_ftp");
        });
      } catch (error) {
        if (error instanceof OnboardingProfileNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }

        const message =
          writeStage === "profile"
            ? "Failed to update profile during onboarding"
            : writeStage === "metrics"
              ? "Failed to insert onboarding metrics"
              : "Failed to insert onboarding efforts";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause: error });
      }

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
});
