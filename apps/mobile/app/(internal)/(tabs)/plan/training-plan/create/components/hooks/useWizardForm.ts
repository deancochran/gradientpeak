import { useState } from "react";

/**
 * Form data structure for the training plan wizard
 */
export interface TrainingPlanFormData {
  // Step 1: Basic Info
  name: string;
  description: string;

  // Step 2: Weekly Targets
  tssMin: number;
  tssMax: number;
  activitiesPerWeek: number;

  // Step 3: Recovery Rules
  maxConsecutiveDays: number;
  minRestDays: number;
  minHoursBetweenHard: number;

  // Step 4: Periodization (optional)
  periodization?: {
    startingCTL: number;
    targetCTL: number;
    rampRate: number;
    targetDate: Date | null;
  };
}

/**
 * Validation errors for each step
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
 * Hook for managing the training plan wizard form state
 * Handles multi-step navigation, validation, and form data
 */
export function useWizardForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<ValidationErrors>({});

  const [formData, setFormData] = useState<TrainingPlanFormData>({
    name: "",
    description: "",
    tssMin: 200,
    tssMax: 400,
    activitiesPerWeek: 4,
    maxConsecutiveDays: 3,
    minRestDays: 1,
    minHoursBetweenHard: 48,
    periodization: undefined,
  });

  /**
   * Update a single field in the form data
   */
  const updateField = <K extends keyof TrainingPlanFormData>(
    field: K,
    value: TrainingPlanFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user makes changes
    if (errors[field as keyof ValidationErrors]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof ValidationErrors];
        return newErrors;
      });
    }
  };

  /**
   * Update periodization values
   */
  const updatePeriodization = (
    field: keyof NonNullable<TrainingPlanFormData["periodization"]>,
    value: number | Date | null,
  ) => {
    setFormData((prev) => ({
      ...prev,
      periodization: {
        ...(prev.periodization || {
          startingCTL: 0,
          targetCTL: 100,
          rampRate: 5,
          targetDate: null,
        }),
        [field]: value,
      },
    }));
  };

  /**
   * Validate Step 1: Basic Info
   */
  const validateStep1 = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Plan name is required";
    } else if (formData.name.length < 3) {
      newErrors.name = "Plan name must be at least 3 characters";
    } else if (formData.name.length > 100) {
      newErrors.name = "Plan name must be less than 100 characters";
    }

    if (formData.description.length > 500) {
      newErrors.description = "Description must be less than 500 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Validate Step 2: Weekly Targets
   */
  const validateStep2 = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (formData.tssMin < 0) {
      newErrors.tssMin = "Minimum TSS must be positive";
    }

    if (formData.tssMax < 0) {
      newErrors.tssMax = "Maximum TSS must be positive";
    }

    if (formData.tssMin >= formData.tssMax) {
      newErrors.tssMax = "Maximum TSS must be greater than minimum TSS";
    }

    if (formData.activitiesPerWeek < 1 || formData.activitiesPerWeek > 14) {
      newErrors.activitiesPerWeek =
        "Activities per week must be between 1 and 14";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Validate Step 3: Recovery Rules
   */
  const validateStep3 = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (formData.maxConsecutiveDays < 1 || formData.maxConsecutiveDays > 7) {
      newErrors.maxConsecutiveDays = "Must be between 1 and 7 days";
    }

    if (formData.minRestDays < 0 || formData.minRestDays > 7) {
      newErrors.minRestDays = "Must be between 0 and 7 days";
    }

    if (formData.minRestDays + formData.maxConsecutiveDays < 7) {
      newErrors.minRestDays = "Rest days and training days must fit in a week";
    }

    if (
      formData.minHoursBetweenHard < 0 ||
      formData.minHoursBetweenHard > 168
    ) {
      newErrors.minHoursBetweenHard = "Must be between 0 and 168 hours";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Validate Step 4: Periodization (optional step)
   */
  const validateStep4 = (): boolean => {
    // Periodization is optional, so if it's not set, it's valid
    if (!formData.periodization) {
      return true;
    }

    const newErrors: ValidationErrors = {};
    const { startingCTL, targetCTL, rampRate } = formData.periodization;

    if (startingCTL < 0 || startingCTL > 200) {
      newErrors.periodization = "Starting CTL must be between 0 and 200";
    }

    if (targetCTL < 0 || targetCTL > 200) {
      newErrors.periodization = "Target CTL must be between 0 and 200";
    }

    if (targetCTL <= startingCTL) {
      newErrors.periodization = "Target CTL must be greater than starting CTL";
    }

    if (rampRate < 1 || rampRate > 20) {
      newErrors.periodization = "Ramp rate must be between 1% and 20%";
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
      case 4:
        return validateStep4();
      default:
        return false;
    }
  };

  /**
   * Go to next step (with validation)
   */
  const nextStep = (): boolean => {
    if (validateCurrentStep()) {
      if (currentStep < 4) {
        setCurrentStep(currentStep + 1);
        return true;
      }
    }
    return false;
  };

  /**
   * Go to previous step
   */
  const previousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setErrors({}); // Clear errors when going back
    }
  };

  /**
   * Skip to a specific step (used for skipping optional steps)
   */
  const skipToStep = (step: number) => {
    if (step >= 1 && step <= 4) {
      setCurrentStep(step);
      setErrors({});
    }
  };

  /**
   * Reset form to initial state
   */
  const resetForm = () => {
    setCurrentStep(1);
    setErrors({});
    setFormData({
      name: "",
      description: "",
      tssMin: 200,
      tssMax: 400,
      activitiesPerWeek: 4,
      maxConsecutiveDays: 3,
      minRestDays: 1,
      minHoursBetweenHard: 48,
      periodization: undefined,
    });
  };

  return {
    // State
    currentStep,
    formData,
    errors,

    // Actions
    updateField,
    updatePeriodization,
    nextStep,
    previousStep,
    skipToStep,
    resetForm,

    // Validation
    validateCurrentStep,

    // Computed
    isFirstStep: currentStep === 1,
    isLastStep: currentStep === 4,
    totalSteps: 4,
  };
}
