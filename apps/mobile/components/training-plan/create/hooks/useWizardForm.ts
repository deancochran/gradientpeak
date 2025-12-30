import { trainingPlanCreateFormSchema } from "@repo/core";
import { useState } from "react";

/**
 * Training plan presets for quick setup
 */
export type PlanPreset = "beginner" | "intermediate" | "advanced" | "custom";

export interface PresetConfig {
  tssMin: number;
  tssMax: number;
  activitiesPerWeek: number;
  maxConsecutiveDays: number;
  minRestDays: number;
}

const PRESETS: Record<PlanPreset, PresetConfig> = {
  beginner: {
    tssMin: 100,
    tssMax: 250,
    activitiesPerWeek: 3,
    maxConsecutiveDays: 2,
    minRestDays: 2,
  },
  intermediate: {
    tssMin: 200,
    tssMax: 400,
    activitiesPerWeek: 4,
    maxConsecutiveDays: 3,
    minRestDays: 2,
  },
  advanced: {
    tssMin: 350,
    tssMax: 600,
    activitiesPerWeek: 5,
    maxConsecutiveDays: 4,
    minRestDays: 1,
  },
  custom: {
    tssMin: 200,
    tssMax: 400,
    activitiesPerWeek: 4,
    maxConsecutiveDays: 3,
    minRestDays: 2,
  },
};

/**
 * Form data structure for the training plan wizard
 */
export interface TrainingPlanFormData {
  // Step 1: Basics + Preset
  name: string;
  description: string;
  preset: PlanPreset;

  // Step 2: Training Schedule (combines weekly targets + recovery)
  tssMin: number;
  tssMax: number;
  activitiesPerWeek: number;
  maxConsecutiveDays: number;
  minRestDays: number;

  // Step 3: Periodization (optional, simplified)
  usePeriodization: boolean;
  startingCTL?: number;
  targetCTL?: number;
  rampRate?: number;
}

/**
 * Validation errors
 */
export interface ValidationErrors {
  name?: string;
  description?: string;
  tssMin?: string;
  tssMax?: string;
  activitiesPerWeek?: string;
  maxConsecutiveDays?: string;
  minRestDays?: string;
  periodization?: string;
}

/**
 * Streamlined wizard form hook with presets and smart defaults
 */
export function useWizardForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<ValidationErrors>({});

  const [formData, setFormData] = useState<TrainingPlanFormData>({
    name: "",
    description: "",
    preset: "intermediate",
    ...PRESETS.intermediate,
    usePeriodization: false,
  });

  /**
   * Apply preset configuration
   */
  const applyPreset = (preset: PlanPreset) => {
    const config = PRESETS[preset];
    setFormData((prev) => ({
      ...prev,
      preset,
      ...config,
    }));
  };

  /**
   * Update a single field
   */
  const updateField = <K extends keyof TrainingPlanFormData>(
    field: K,
    value: TrainingPlanFormData[K],
  ) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      // Auto-adjust related fields for consistency
      if (field === "tssMin" && typeof value === "number") {
        // Ensure max is at least 50 more than min
        if (updated.tssMax < value + 50) {
          updated.tssMax = value + 100;
        }
      }

      if (field === "maxConsecutiveDays" && typeof value === "number") {
        // Ensure rest days fit in the week
        const maxRest = 7 - value;
        if (updated.minRestDays > maxRest) {
          updated.minRestDays = Math.max(1, maxRest);
        }
      }

      if (field === "minRestDays" && typeof value === "number") {
        // Ensure training days fit in the week
        const maxTraining = 7 - value;
        if (updated.maxConsecutiveDays > maxTraining) {
          updated.maxConsecutiveDays = Math.max(2, maxTraining);
        }
      }

      return updated;
    });

    // Clear error for this field
    if (errors[field as keyof ValidationErrors]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof ValidationErrors];
        return newErrors;
      });
    }
  };

  /**
   * Validate Step 1: Basics
   */
  const validateStep1 = (): boolean => {
    const newErrors: ValidationErrors = {};

    try {
      // Use standardized schema for validation
      const step1Schema = trainingPlanCreateFormSchema.pick({
        name: true,
        description: true,
      });

      step1Schema.parse({
        name: formData.name,
        description: formData.description || null,
      });
    } catch (error: any) {
      if (error?.issues) {
        error.issues.forEach((issue: any) => {
          const field = issue.path[0] as keyof ValidationErrors;
          if (field) {
            newErrors[field] = issue.message;
          }
        });
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Validate Step 2: Training Schedule
   */
  const validateStep2 = (): boolean => {
    const newErrors: ValidationErrors = {};

    try {
      // Use standardized schema for validation
      const step2Schema = trainingPlanCreateFormSchema.pick({
        tss_min: true,
        tss_max: true,
        activities_per_week: true,
        max_consecutive_days: true,
        min_rest_days: true,
      });

      step2Schema.parse({
        tss_min: formData.tssMin,
        tss_max: formData.tssMax,
        activities_per_week: formData.activitiesPerWeek,
        max_consecutive_days: formData.maxConsecutiveDays,
        min_rest_days: formData.minRestDays,
      });
    } catch (error: any) {
      if (error?.issues) {
        error.issues.forEach((issue: any) => {
          const path = issue.path[0] as string;
          // Map snake_case to camelCase for error display
          const fieldMap: Record<string, keyof ValidationErrors> = {
            tss_min: "tssMin",
            tss_max: "tssMax",
            activities_per_week: "activitiesPerWeek",
            max_consecutive_days: "maxConsecutiveDays",
            min_rest_days: "minRestDays",
          };
          const field = fieldMap[path];
          if (field) {
            newErrors[field] = issue.message;
          }
        });
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Validate Step 3: Periodization (optional)
   */
  const validateStep3 = (): boolean => {
    if (!formData.usePeriodization) {
      return true; // Skip validation if not using periodization
    }

    const newErrors: ValidationErrors = {};

    try {
      // Use standardized schema for validation
      const step3Schema = trainingPlanCreateFormSchema.pick({
        use_periodization: true,
        starting_ctl: true,
        target_ctl: true,
        ramp_rate: true,
      });

      step3Schema.parse({
        use_periodization: formData.usePeriodization,
        starting_ctl: formData.startingCTL || null,
        target_ctl: formData.targetCTL || null,
        ramp_rate: formData.rampRate || null,
      });
    } catch (error: any) {
      if (error?.issues) {
        error.issues.forEach((issue: any) => {
          newErrors.periodization = issue.message;
        });
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Validate current step
   */
  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 1:
        return validateStep1();
      case 2:
        return validateStep2();
      case 3:
        return validateStep3();
      default:
        return true;
    }
  };

  /**
   * Next step with validation
   */
  const nextStep = (): boolean => {
    if (validateCurrentStep()) {
      if (currentStep < 3) {
        setCurrentStep(currentStep + 1);
        return true;
      }
    }
    return false;
  };

  /**
   * Previous step
   */
  const previousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setErrors({});
    }
  };

  /**
   * Reset form
   */
  const resetForm = () => {
    setCurrentStep(1);
    setErrors({});
    setFormData({
      name: "",
      description: "",
      preset: "intermediate",
      ...PRESETS.intermediate,
      usePeriodization: false,
    });
  };

  return {
    // State
    currentStep,
    formData,
    errors,

    // Actions
    updateField,
    applyPreset,
    nextStep,
    previousStep,
    resetForm,
    validateCurrentStep,

    // Computed
    isFirstStep: currentStep === 1,
    isLastStep: currentStep === 3,
    totalSteps: 3,
  };
}
