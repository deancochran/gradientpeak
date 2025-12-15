/**
 * Recording Validation Sheet
 *
 * Shows validation errors and warnings before starting a recording.
 * Blocks recording if there are critical errors (e.g., GPS required but unavailable).
 */

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { AlertTriangle, Info, XCircle } from "lucide-react-native";
import { ScrollView, View } from "react-native";

interface RecordingValidationSheetProps {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  onDismiss: () => void;
  onProceed?: () => void;
}

export function RecordingValidationSheet({
  isValid,
  errors,
  warnings,
  onDismiss,
  onProceed,
}: RecordingValidationSheetProps) {
  // If valid and no warnings, auto-proceed
  if (isValid && warnings.length === 0) {
    onProceed?.();
    return null;
  }

  return (
    <View className="flex-1 bg-background">
      <View className="p-4 border-b border-border">
        <Text className="text-xl font-semibold">
          {isValid ? "Recording Checks" : "Cannot Start Recording"}
        </Text>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Errors (blocking) */}
        {errors.length > 0 && (
          <View className="mb-6">
            <View className="flex-row items-center gap-2 mb-3">
              <Icon as={XCircle} size={20} className="text-destructive" />
              <Text className="text-lg font-semibold text-destructive">
                Errors
              </Text>
            </View>
            {errors.map((error, index) => (
              <View
                key={index}
                className="bg-destructive/10 p-3 rounded-lg mb-2 border border-destructive/20"
              >
                <Text className="text-sm text-destructive">{error}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Warnings (non-blocking) */}
        {warnings.length > 0 && (
          <View className="mb-6">
            <View className="flex-row items-center gap-2 mb-3">
              <Icon as={AlertTriangle} size={20} className="text-yellow-600" />
              <Text className="text-lg font-semibold text-yellow-600">
                Warnings
              </Text>
            </View>
            {warnings.map((warning, index) => (
              <View
                key={index}
                className="bg-yellow-500/10 p-3 rounded-lg mb-2 border border-yellow-500/20"
              >
                <Text className="text-sm text-yellow-600">{warning}</Text>
              </View>
            ))}
            <View className="bg-muted/50 p-3 rounded-lg mt-2 flex-row gap-2">
              <Icon as={Info} size={16} className="text-muted-foreground mt-0.5" />
              <Text className="text-xs text-muted-foreground flex-1">
                You can proceed with these warnings, but some features may be limited.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Actions */}
      <View className="p-4 border-t border-border gap-3">
        {isValid && onProceed && (
          <Button onPress={onProceed}>
            <Text className="text-primary-foreground font-semibold">
              Start Recording
            </Text>
          </Button>
        )}
        <Button variant="outline" onPress={onDismiss}>
          <Text className="font-semibold">
            {isValid ? "Cancel" : "Go Back"}
          </Text>
        </Button>
      </View>
    </View>
  );
}
