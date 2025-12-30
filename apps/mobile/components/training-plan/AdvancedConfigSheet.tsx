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
  } | null;
}

interface AdvancedConfigSheetProps {
  visible: boolean;
  onClose: () => void;
  initialData: AdvancedConfigData;
  onSave: (data: AdvancedConfigData) => Promise<void>;
  isSaving?: boolean;
}

export function AdvancedConfigSheet({
  visible,
  onClose,
  initialData,
  onSave,
  isSaving = false,
}: AdvancedConfigSheetProps) {
  const [activeTab, setActiveTab] = useState("targets");
  const [formData, setFormData] = useState<AdvancedConfigData>(initialData);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

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
    if (formData.target_activities_per_week < 1 || formData.target_activities_per_week > 14) {
      errors.activities_per_week = "Activities per week must be between 1 and 14";
    }

    // Recovery Rules validation
    if (formData.max_consecutive_days < 1 || formData.max_consecutive_days > 7) {
      errors.max_consecutive_days = "Max consecutive days must be between 1 and 7";
    }
    if (formData.min_rest_days_per_week < 0 || formData.min_rest_days_per_week > 7) {
      errors.min_rest_days = "Min rest days must be between 0 and 7";
    }

    // Cross-field validation
    if (formData.target_activities_per_week + formData.min_rest_days_per_week > 7) {
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
          <Text className="text-xl font-bold">Advanced Training Configuration</Text>
          <Pressable onPress={onClose} className="p-2">
            <Icon as={X} size={24} className="text-foreground" />
          </Pressable>
        </View>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <View className="px-4 pt-4">
            <TabsList>
              <TabsTrigger value="targets" className="flex-1">
                <Text>Weekly Targets</Text>
              </TabsTrigger>
              <TabsTrigger value="recovery" className="flex-1">
                <Text>Recovery</Text>
              </TabsTrigger>
              <TabsTrigger value="periodization" className="flex-1">
                <Text>Periodization</Text>
              </TabsTrigger>
            </TabsList>
          </View>

          <ScrollView className="flex-1">
            {/* Weekly Targets Tab */}
            <TabsContent value="targets" className="p-4">
              <WeeklyTargetsForm
                data={{
                  target_weekly_tss_min: formData.target_weekly_tss_min,
                  target_weekly_tss_max: formData.target_weekly_tss_max,
                  target_activities_per_week: formData.target_activities_per_week,
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
                  target_activities_per_week: formData.target_activities_per_week,
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
            <Button
              className="flex-1"
              onPress={handleSave}
              disabled={isSaving}
            >
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
