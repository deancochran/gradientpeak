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
  minHoursBetweenHard: number;
}

const PRESETS: Record<PlanPreset, PresetConfig> = {
  beginner: {
    tssMin: 100,
    tssMax: 250,
    activitiesPerWeek: 3,
    maxConsecutiveDays: 2,
    minRestDays: 2,
    minHoursBetweenHard: 72,
  },
  intermediate: {
    tssMin: 200,
    tssMax: 400,
    activitiesPerWeek: 4,
    maxConsecutiveDays: 3,
    minRestDays: 2,
    minHoursBetweenHard: 48,
  },
  advanced: {
    tssMin: 350,
    tssMax: 600,
    activitiesPerWeek: 5,
    maxConsecutiveDays: 4,
    minRestDays: 1,
    minHoursBetweenHard: 48,
  },
  custom: {
    tssMin: 200,
    tssMax: 400,
    activitiesPerWeek: 4,
    maxConsecutiveDays: 3,
    minRestDays: 2,
    minHoursBetweenHard: 48,
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
  minHoursBetweenHard: number;

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
  minHoursBetweenHard?: string;
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

    if (!formData.name.trim()) {
      newErrors.name = "Plan name is required";
    } else if (formData.name.length < 3) {
      newErrors.name = "Name must be at least 3 characters";
    }

    if (formData.description.length > 500) {
      newErrors.description = "Description must be less than 500 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Validate Step 2: Training Schedule
   */
  const validateStep2 = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (formData.tssMin < 50 || formData.tssMin > 1000) {
      newErrors.tssMin = "Min TSS should be 50-1000";
    }

    if (formData.tssMax < 100 || formData.tssMax > 1500) {
      newErrors.tssMax = "Max TSS should be 100-1500";
    }

    if (formData.tssMin >= formData.tssMax) {
      newErrors.tssMax = "Max must be greater than min";
    }

    if (formData.activitiesPerWeek < 1 || formData.activitiesPerWeek > 14) {
      newErrors.activitiesPerWeek = "Must be 1-14 activities";
    }

    if (formData.maxConsecutiveDays < 1 || formData.maxConsecutiveDays > 7) {
      newErrors.maxConsecutiveDays = "Must be 1-7 days";
    }

    if (formData.minRestDays < 0 || formData.minRestDays > 7) {
      newErrors.minRestDays = "Must be 0-7 days";
    }

    if (formData.minRestDays + formData.maxConsecutiveDays > 7) {
      newErrors.minRestDays = "Training + rest days must fit in a week";
    }

    if (
      formData.minHoursBetweenHard < 0 ||
      formData.minHoursBetweenHard > 168
    ) {
      newErrors.minHoursBetweenHard = "Must be 0-168 hours";
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

    if (
      !formData.startingCTL ||
      formData.startingCTL < 0 ||
      formData.startingCTL > 200
    ) {
      newErrors.periodization = "Starting CTL must be 0-200";
    }

    if (
      !formData.targetCTL ||
      formData.targetCTL < 0 ||
      formData.targetCTL > 250
    ) {
      newErrors.periodization = "Target CTL must be 0-250";
    }

    if (
      formData.startingCTL &&
      formData.targetCTL &&
      formData.targetCTL <= formData.startingCTL
    ) {
      newErrors.periodization = "Target must be greater than starting CTL";
    }

    if (!formData.rampRate || formData.rampRate < 1 || formData.rampRate > 20) {
      newErrors.periodization = "Ramp rate must be 1-20 per week";
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
