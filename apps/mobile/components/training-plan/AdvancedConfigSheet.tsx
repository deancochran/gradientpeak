import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { X } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  View,
  Pressable,
} from "react-native";
import { PeriodizationForm } from "./forms/PeriodizationForm";
import { RecoveryRulesForm } from "./forms/RecoveryRulesForm";
import { WeeklyTargetsForm } from "./forms/WeeklyTargetsForm";
import { ActivityDistributionForm } from "./forms/ActivityDistributionForm";
import { MesocycleBuilderForm } from "./forms/MesocycleBuilderForm";
import { FitnessProjectionChart } from "@/components/charts";
import type { Mesocycle } from "@repo/core";

type PublicActivityCategory = "run" | "bike" | "swim" | "strength" | "other";

export interface AdvancedConfigData {
  // Weekly Targets
  target_weekly_tss_min: number;
  target_weekly_tss_max: number;
  target_activities_per_week: number;

  // Recovery Rules
  max_consecutive_days: number;
  min_rest_days_per_week: number;

  // Periodization (optional)
  periodization_template?: {
    starting_ctl: number;
    target_ctl: number;
    ramp_rate: number;
    target_date: string;
    mesocycles?: Mesocycle[];
    recovery_week_frequency?: number;
    recovery_week_reduction?: number;
  } | null;

  // NEW: Activity Distribution
  activity_type_distribution?: Record<PublicActivityCategory, number>;
}

interface AdvancedConfigSheetProps {
  visible: boolean;
  onClose: () => void;
  initialData: AdvancedConfigData;
  onSave: (data: AdvancedConfigData) => Promise<void>;
  isSaving?: boolean;
  currentCTL?: number; // Current CTL from API
}

export function AdvancedConfigSheet({
  visible,
  onClose,
  initialData,
  onSave,
  isSaving = false,
  currentCTL = 0,
}: AdvancedConfigSheetProps) {
  const [activeTab, setActiveTab] = useState("targets");
  const [formData, setFormData] = useState<AdvancedConfigData>(initialData);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  // Reset form when modal opens
  React.useEffect(() => {
    if (visible) {
      setFormData(initialData);
      setValidationErrors({});
      setActiveTab("targets");
    }
  }, [visible, initialData]);

  // Update form data for a specific section
  const updateFormData = (updates: Partial<AdvancedConfigData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  // Validate all data
  const validateData = (): boolean => {
    const errors: Record<string, string> = {};

    // Weekly Targets validation
    if (formData.target_weekly_tss_min < 0) {
      errors.tss_min = "Min TSS must be at least 0";
    }
    if (formData.target_weekly_tss_max < formData.target_weekly_tss_min) {
      errors.tss_max = "Max TSS must be greater than or equal to Min TSS";
    }
    if (
      formData.target_activities_per_week < 1 ||
      formData.target_activities_per_week > 14
    ) {
      errors.activities_per_week =
        "Activities per week must be between 1 and 14";
    }

    // Recovery Rules validation
    if (
      formData.max_consecutive_days < 1 ||
      formData.max_consecutive_days > 7
    ) {
      errors.max_consecutive_days =
        "Max consecutive days must be between 1 and 7";
    }
    if (
      formData.min_rest_days_per_week < 0 ||
      formData.min_rest_days_per_week > 7
    ) {
      errors.min_rest_days = "Min rest days must be between 0 and 7";
    }

    // Cross-field validation
    if (
      formData.target_activities_per_week + formData.min_rest_days_per_week >
      7
    ) {
      errors.schedule = "Activities per week plus rest days cannot exceed 7";
    }

    // Periodization validation (if enabled)
    if (formData.periodization_template) {
      const p = formData.periodization_template;
      if (p.starting_ctl < 0) {
        errors.starting_ctl = "Starting CTL must be at least 0";
      }
      if (p.target_ctl <= p.starting_ctl) {
        errors.target_ctl = "Target CTL must be greater than starting CTL";
      }
      if (p.ramp_rate < 0.01 || p.ramp_rate > 1) {
        errors.ramp_rate = "Ramp rate must be between 0.01 and 1";
      }
      if (!p.target_date) {
        errors.target_date = "Target date is required";
      }
    }

    // Activity distribution validation (if multi-sport)
    if (formData.activity_type_distribution) {
      const sum = Object.values(formData.activity_type_distribution).reduce(
        (a, b) => a + b,
        0,
      );
      if (Math.abs(sum - 1.0) > 0.01) {
        errors.activity_distribution = `Activity percentages must sum to 100% (currently ${Math.round(sum * 100)}%)`;
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle save
  const handleSave = async () => {
    if (!validateData()) {
      return;
    }
    await onSave(formData);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between p-4 border-b border-border">
          <Text className="text-xl font-bold">
            Advanced Training Configuration
          </Text>
          <Pressable onPress={onClose} className="p-2">
            <Icon as={X} size={24} className="text-foreground" />
          </Pressable>
        </View>

        {/* Fitness Projection Chart (always visible at top) */}
        {formData.periodization_template &&
          formData.periodization_template.mesocycles &&
          formData.periodization_template.mesocycles.length > 0 && (
            <View className="px-4 pt-4 pb-2">
              <FitnessProjectionChart
                currentCTL={currentCTL}
                targetCTL={formData.periodization_template.target_ctl}
                targetDate={formData.periodization_template.target_date}
                weeklyTSSAvg={
                  (formData.target_weekly_tss_min +
                    formData.target_weekly_tss_max) /
                  2
                }
                mesocycles={formData.periodization_template.mesocycles}
                rampRate={formData.periodization_template.ramp_rate}
                recoveryWeekFrequency={
                  formData.periodization_template.recovery_week_frequency || 3
                }
                recoveryWeekReduction={
                  formData.periodization_template.recovery_week_reduction || 0.5
                }
                height={250}
              />
            </View>
          )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <View className="px-4 pt-4">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TabsList>
                <TabsTrigger value="targets">
                  <Text className="text-xs">Targets</Text>
                </TabsTrigger>
                <TabsTrigger value="recovery">
                  <Text className="text-xs">Recovery</Text>
                </TabsTrigger>
                <TabsTrigger value="periodization">
                  <Text className="text-xs">Periodization</Text>
                </TabsTrigger>
                <TabsTrigger value="activities">
                  <Text className="text-xs">Activity Mix</Text>
                </TabsTrigger>
                <TabsTrigger value="phases">
                  <Text className="text-xs">Phases</Text>
                </TabsTrigger>
              </TabsList>
            </ScrollView>
          </View>

          <ScrollView className="flex-1">
            {/* Weekly Targets Tab */}
            <TabsContent value="targets" className="p-4">
              <WeeklyTargetsForm
                data={{
                  target_weekly_tss_min: formData.target_weekly_tss_min,
                  target_weekly_tss_max: formData.target_weekly_tss_max,
                  target_activities_per_week:
                    formData.target_activities_per_week,
                }}
                onChange={(updates) => updateFormData(updates)}
                errors={validationErrors}
              />
            </TabsContent>

            {/* Recovery Rules Tab */}
            <TabsContent value="recovery" className="p-4">
              <RecoveryRulesForm
                data={{
                  max_consecutive_days: formData.max_consecutive_days,
                  min_rest_days_per_week: formData.min_rest_days_per_week,
                  target_activities_per_week:
                    formData.target_activities_per_week,
                }}
                onChange={(updates) => updateFormData(updates)}
                errors={validationErrors}
              />
            </TabsContent>

            {/* Periodization Tab */}
            <TabsContent value="periodization" className="p-4">
              <PeriodizationForm
                data={formData.periodization_template}
                onChange={(periodization) =>
                  updateFormData({ periodization_template: periodization })
                }
                errors={validationErrors}
                currentCTL={currentCTL}
              />
            </TabsContent>

            {/* Activity Distribution Tab */}
            <TabsContent value="activities" className="p-4">
              <ActivityDistributionForm
                data={formData.activity_type_distribution || null}
                onChange={(distribution) =>
                  updateFormData({ activity_type_distribution: distribution })
                }
                errors={validationErrors}
              />
            </TabsContent>

            {/* Training Phases Tab */}
            <TabsContent value="phases" className="p-4">
              <MesocycleBuilderForm
                data={formData.periodization_template?.mesocycles || null}
                onChange={(mesocycles) =>
                  updateFormData({
                    periodization_template: {
                      ...formData.periodization_template!,
                      mesocycles,
                    },
                  })
                }
                periodizationData={
                  formData.periodization_template
                    ? {
                        starting_ctl: currentCTL,
                        target_ctl: formData.periodization_template.target_ctl,
                        target_date:
                          formData.periodization_template.target_date,
                      }
                    : undefined
                }
                errors={validationErrors}
              />
            </TabsContent>
          </ScrollView>
        </Tabs>

        {/* Footer Actions */}
        <View className="p-4 border-t border-border gap-3">
          {/* Global validation error */}
          {validationErrors.schedule && (
            <View className="bg-destructive/10 border border-destructive rounded-lg p-3">
              <Text className="text-destructive text-sm font-medium">
                {validationErrors.schedule}
              </Text>
            </View>
          )}

          <View className="flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onPress={onClose}
              disabled={isSaving}
            >
              <Text className="text-foreground">Cancel</Text>
            </Button>
            <Button className="flex-1" onPress={handleSave} disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-primary-foreground font-semibold">
                  Save Changes
                </Text>
              )}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
