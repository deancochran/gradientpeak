import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SmartSuggestion } from "@/lib/hooks/useSmartSuggestions";
import { AlertCircle, AlertTriangle, X } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";

interface TrainingPlanAdjustmentAlertProps {
  suggestion: SmartSuggestion;
  onPress: () => void;
  onDismiss: () => void;
}

export function TrainingPlanAdjustmentAlert({
  suggestion,
  onPress,
  onDismiss,
}: TrainingPlanAdjustmentAlertProps) {
  const isAlert = suggestion.severity === "alert";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`flex-row items-start p-4 rounded-lg border mb-4 ${
        isAlert
          ? "bg-destructive/10 border-destructive/30"
          : "bg-amber-500/10 border-amber-500/30"
      }`}
    >
      {/* Icon */}
      <View className="mr-3 mt-0.5">
        <Icon
          as={isAlert ? AlertCircle : AlertTriangle}
          size={20}
          className={isAlert ? "text-destructive" : "text-amber-500"}
        />
      </View>

      {/* Content */}
      <View className="flex-1">
        <Text className="font-semibold text-sm mb-1">
          {suggestion.title}
        </Text>
        <Text className="text-xs text-muted-foreground leading-relaxed">
          {suggestion.description}
        </Text>
        <Text className="text-xs text-primary font-medium mt-2">
          Tap to adjust
        </Text>
      </View>

      {/* Dismiss Button */}
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="ml-2 p-1"
      >
        <Icon as={X} size={18} className="text-muted-foreground" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
