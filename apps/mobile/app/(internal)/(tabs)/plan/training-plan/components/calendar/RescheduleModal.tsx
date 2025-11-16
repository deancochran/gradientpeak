// gradientpeak/apps/mobile/app/(internal)/(tabs)/plan/training-plan/components/calendar/RescheduleModal.tsx

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, TouchableOpacity, View } from "react-native";

interface RescheduleModalProps {
  visible: boolean;
  activityName: string;
  currentDate: Date;
  onConfirm: (newDate: Date) => void;
  onCancel: () => void;
}

/**
 * Modal for rescheduling a planned activity to a new date
 */
export function RescheduleModal({
  visible,
  activityName,
  currentDate,
  onConfirm,
  onCancel,
}: RescheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState(currentDate);

  const handleConfirm = () => {
    onConfirm(selectedDate);
  };

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
            {/* Header */}
            <Text className="text-xl font-bold text-gray-900 mb-2">
              Reschedule Activity
            </Text>
            <Text className="text-sm text-gray-600 mb-4" numberOfLines={2}>
              {activityName}
            </Text>

            {/* Current Date */}
            <View className="mb-4 p-3 bg-gray-50 rounded-lg">
              <Text className="text-xs text-gray-500 mb-1">Current Date</Text>
              <Text className="text-sm font-medium text-gray-900">
                {formatDate(currentDate)}
              </Text>
            </View>

            {/* Date Picker */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-gray-900 mb-2">
                Select New Date
              </Text>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="spinner"
                onChange={(event, date) => {
                  if (date) setSelectedDate(date);
                }}
                minimumDate={new Date()}
              />
            </View>

            {/* Selected Date Preview */}
            <View className="mb-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <Text className="text-xs text-blue-600 mb-1">New Date</Text>
              <Text className="text-sm font-semibold text-blue-900">
                {formatDate(selectedDate)}
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
                onPress={handleConfirm}
                className="flex-1"
              >
                <Text className="text-white font-semibold">
                  Confirm
                </Text>
              </Button>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
