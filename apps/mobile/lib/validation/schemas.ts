/**
 * Mobile App Validation Schemas
 *
 * This file re-exports validation schemas from @repo/core for convenience.
 * All schemas are defined in @repo/core/schemas/form-schemas.ts
 *
 * For new code, import directly from @repo/core:
 * import { activitySubmissionFormSchema } from "@repo/core"
 */

// Re-export all form schemas from core
export {
  activityCategorySchema,
  activityLocationSchema,
  // Activity schemas
  activityNameSchema,
  activityNotesSchema,
  activityPlanCreateFormSchema,
  activityPlanDescriptionSchema,
  // Activity plan schemas
  activityPlanNameSchema,
  activityPlanNotesSchema,
  activityPlanUpdateFormSchema,
  activitySubmissionFormSchema,
  ageSchema,
  bioSchema,
  cadenceSchema,
  dateStringSchema,
  dobSchema,
  // Common validation patterns
  emailSchema,
  estimatedDurationSchema,
  estimatedTssSchema,
  // All schemas object
  formSchemas,
  ftpSchema,
  futureDateSchema,
  genderSchema,
  heartRateZoneSchema,
  intensityPercentageSchema,
  optionalActivityNotesSchema,
  optionalActivityPlanDescriptionSchema,
  optionalAgeSchema,
  optionalBioSchema,
  optionalDobSchema,
  optionalEmailSchema,
  optionalEstimatedDurationSchema,
  optionalEstimatedTssSchema,
  optionalFtpSchema,
  optionalGenderSchema,
  optionalMaxHrSchema,
  optionalPhoneSchema,
  optionalRestingHrSchema,
  optionalThresholdHrSchema,
  optionalTrainingPlanDescriptionSchema,
  optionalUrlSchema,
  optionalUsernameSchema,
  optionalWeeklyTssTargetSchema,
  optionalWeightKgSchema,
  pastDateSchema,
  phoneSchema,
  plannedActivityRescheduleFormSchema,
  // Planned activity schemas
  plannedActivityScheduleFormSchema,
  plannedActivityUpdateFormSchema,
  powerZoneSchema,
  profileQuickUpdateSchema,
  profileSettingsFormSchema,
  repetitionCountSchema,
  restingHrSchema,
  rpeSchema,
  speedSchema,
  // Step validation schemas
  stepDurationSecondsSchema,
  thresholdHrSchema,
  trainingPlanBasicInfoFormSchema,
  trainingPlanCreateFormSchema,
  // Training plan schemas
  trainingPlanNameSchema,
  trainingPlanPeriodizationFormSchema,
  trainingPlanRecoveryRulesFormSchema,
  trainingPlanWeeklyTargetsFormSchema,
  urlSchema,
  usernameSchema,
  weeklyTssTargetSchema,
  // Profile schemas
  weightKgSchema,
  type ActivityPlanCreateFormData,
  type ActivityPlanUpdateFormData,
  type ActivitySubmissionFormData,
  type PlannedActivityRescheduleFormData,
  type PlannedActivityScheduleFormData,
  type PlannedActivityUpdateFormData,
  type ProfileQuickUpdateData,
  type ProfileSettingsFormData,
  type TrainingPlanBasicInfoFormData,
  type TrainingPlanCreateFormData,
  type TrainingPlanPeriodizationFormData,
  type TrainingPlanRecoveryRulesFormData,
  type TrainingPlanWeeklyTargetsFormData,
} from "@repo/core";

// Legacy aliases for backwards compatibility
// These are deprecated and should be updated to use the core names
export {
  profileSettingsFormSchema as profileFormSchema,
  type ProfileSettingsFormData as ProfileFormValues,
} from "@repo/core";
