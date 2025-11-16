// gradientpeak/apps/mobile/app/(internal)/(tabs)/plan/training-plan/components/calendar/DeleteConfirmationModal.tsx

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { AlertTriangle } from "lucide-react-native";
import { Modal, TouchableOpacity, View } from "react-native";

interface DeleteConfirmationModalProps {
  visible: boolean;
  activityName: string;
  activityDate: Date;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal for confirming deletion of a planned activity
 */
export function DeleteConfirmationModal({
  visible,
  activityName,
  activityDate,
  onConfirm,
  onCancel,
}: DeleteConfirmationModalProps) {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onCancel}
        className="flex-1 bg-black/50 items-center justify-center p-4"
      >
        <TouchableOpacity activeOpacity={1} className="w-full max-w-md">
          <View className="bg-white rounded-lg p-6 shadow-lg">
            {/* Warning Icon */}
            <View className="items-center mb-4">
              <View className="bg-red-100 rounded-full p-3 mb-3">
                <Icon as={AlertTriangle} size={32} className="text-red-600" />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center">
                Delete Activity?
              </Text>
            </View>

            {/* Activity Details */}
            <View className="mb-6">
              <Text className="text-sm text-gray-600 text-center mb-4">
                Are you sure you want to delete this planned activity? This action cannot be undone.
              </Text>

              <View className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <Text className="text-sm font-semibold text-gray-900 mb-1" numberOfLines={2}>
                  {activityName}
                </Text>
                <Text className="text-xs text-gray-500">
                  Scheduled for {formatDate(activityDate)}
                </Text>
              </View>
            </View>

            {/* Warning Message */}
            <View className="mb-6 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <Text className="text-xs text-yellow-800">
                💡 Tip: Completed activities cannot be deleted from this screen. Only planned activities can be removed.
              </Text>
            </View>

            {/* Actions */}
            <View className="flex-row gap-3">
              <Button
                onPress={onCancel}
                variant="outline"
                className="flex-1"
              >
                <Text className="font-semibold">Cancel</Text>
              </Button>
              <Button
                onPress={onConfirm}
                className="flex-1 bg-red-600"
              >
                <Text className="text-white font-semibold">
                  Delete
                </Text>
              </Button>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
