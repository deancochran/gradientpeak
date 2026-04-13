import { ADJUSTMENT_PRESETS, type AdjustmentType, getAdjustmentSummary } from "@repo/core/plan";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Separator } from "@repo/ui/components/separator";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { Settings2, Sparkles, X } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, TouchableOpacity, View } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useDedupedPush } from "@/lib/navigation/useDedupedPush";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { SmartSuggestion } from "@/lib/hooks/useSmartSuggestions";

interface QuickAdjustSheetProps {
  visible: boolean;
  onClose: () => void;
  plan: any;
  smartSuggestion?: SmartSuggestion | null;
}

export function QuickAdjustSheet({
  visible,
  onClose,
  plan,
  smartSuggestion,
}: QuickAdjustSheetProps) {
  const router = useRouter();
  const pushIfNotCurrent = useDedupedPush();
  const utils = api.useUtils();

  const applyAdjustmentMutation = useReliableMutation(api.trainingPlans.applyQuickAdjustment, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      Alert.alert("Success", "Training plan adjusted successfully");
      onClose();
    },
    onError: (error) => {
      Alert.alert("Adjustment Failed", error.message || "Failed to adjust plan");
    },
  });

  const handleApplySuggestion = () => {
    if (!smartSuggestion || !plan) return;

    const changes = getAdjustmentSummary(plan.structure, smartSuggestion.adjustedStructure);

    Alert.alert(
      "Apply Smart Suggestion?",
      `This will make the following changes:\n\n${changes.join("\n")}\n\nYou can always adjust again later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply",
          onPress: async () => {
            await applyAdjustmentMutation.mutateAsync({
              id: plan.id,
              adjustedStructure: smartSuggestion.adjustedStructure,
            });
          },
        },
      ],
    );
  };

  const handleApplyPreset = (type: AdjustmentType) => {
    if (!plan) return;

    const preset = ADJUSTMENT_PRESETS.find((p) => p.type === type);
    if (!preset) return;

    const adjustedStructure = preset.calculate(plan.structure);
    const changes = getAdjustmentSummary(plan.structure, adjustedStructure);

    Alert.alert(
      `${preset.label}?`,
      `This will make the following changes:\n\n${changes.join("\n")}\n\nYou can always adjust again later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply",
          onPress: async () => {
            await applyAdjustmentMutation.mutateAsync({
              id: plan.id,
              adjustedStructure,
            });
          },
        },
      ],
    );
  };

  const handleCustomAdjustment = () => {
    onClose();
    pushIfNotCurrent({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: plan.id, initialTab: "plan" },
    } as any);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className="flex-1 justify-end bg-black/50"
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          className="bg-background rounded-t-3xl"
          style={{ maxHeight: "85%" }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between p-4 border-b border-border">
            <Text className="text-xl font-semibold">Adjust Training Plan</Text>
            <TouchableOpacity onPress={onClose} className="p-2">
              <Icon as={X} size={24} className="text-muted-foreground" />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1">
            <View className="p-4 gap-4">
              {/* Smart Suggestion Section */}
              {smartSuggestion && (
                <View>
                  <View className="flex-row items-center mb-3">
                    <Icon as={Sparkles} size={20} className="text-primary mr-2" />
                    <Text className="text-lg font-semibold">Smart Suggestion</Text>
                  </View>

                  <View
                    className={`p-4 rounded-lg border ${
                      smartSuggestion.severity === "alert"
                        ? "bg-destructive/10 border-destructive/30"
                        : "bg-primary/10 border-primary/30"
                    }`}
                  >
                    <Text className="font-semibold mb-2">{smartSuggestion.title}</Text>
                    <Text className="text-sm text-muted-foreground mb-4">
                      {smartSuggestion.description}
                    </Text>

                    <Button
                      onPress={handleApplySuggestion}
                      disabled={applyAdjustmentMutation.isPending}
                      className="w-full"
                    >
                      {applyAdjustmentMutation.isPending ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Text className="text-primary-foreground font-semibold">
                          Apply Suggestion
                        </Text>
                      )}
                    </Button>
                  </View>

                  {/* Divider */}
                  <View className="flex-row items-center my-6">
                    <Separator className="flex-1" />
                    <Text className="px-4 text-sm text-muted-foreground">
                      Or choose adjustment type
                    </Text>
                    <Separator className="flex-1" />
                  </View>
                </View>
              )}

              {/* Quick Adjustment Presets */}
              <View>
                {!smartSuggestion && (
                  <Text className="text-lg font-semibold mb-3">Quick Adjustments</Text>
                )}

                <View className="gap-3">
                  {ADJUSTMENT_PRESETS.map((preset) => (
                    <TouchableOpacity
                      key={preset.type}
                      onPress={() => handleApplyPreset(preset.type)}
                      disabled={applyAdjustmentMutation.isPending}
                      className="flex-row items-center p-4 bg-card border border-border rounded-lg active:bg-muted"
                      activeOpacity={0.7}
                    >
                      <View className="w-12 h-12 items-center justify-center bg-muted rounded-full mr-3">
                        <Text className="text-2xl">{preset.icon}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold mb-1">{preset.label}</Text>
                        <Text className="text-sm text-muted-foreground">{preset.description}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Custom Adjustment */}
              <View className="mt-2">
                <TouchableOpacity
                  onPress={handleCustomAdjustment}
                  className="flex-row items-center justify-center p-4 border border-border rounded-lg active:bg-muted"
                  activeOpacity={0.7}
                >
                  <Icon as={Settings2} size={20} className="text-primary mr-2" />
                  <Text className="text-primary font-semibold">Custom Adjustment</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
