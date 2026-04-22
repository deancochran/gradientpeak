import { Text } from "@repo/ui/components/text";
import { X } from "lucide-react-native";
import React, { useState } from "react";
import { Modal, ScrollView, TouchableOpacity, View } from "react-native";
import type { TimeRange } from "@/components/TimeRangeSelector";

interface ChartModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: (timeRange: TimeRange) => React.ReactNode;
  defaultTimeRange?: TimeRange;
}

export function ChartModal({
  visible,
  onClose,
  title,
  children,
  defaultTimeRange = "1M",
}: ChartModalProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultTimeRange);

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: "1M", label: "1M" },
    { value: "3M", label: "3M" },
    { value: "6M", label: "6M" },
    { value: "12M", label: "12M" },
    { value: "ALL", label: "All" },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <View className="px-4 pt-4 pb-3 border-b border-border">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-2xl font-bold text-foreground">{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              className="h-10 w-10 items-center justify-center rounded-full bg-muted"
              activeOpacity={0.7}
            >
              <X size={24} className="text-foreground" />
            </TouchableOpacity>
          </View>

          <View className="flex-row bg-muted rounded-lg p-1 gap-1">
            {timeRanges.map((range) => (
              <TouchableOpacity
                key={range.value}
                onPress={() => setTimeRange(range.value)}
                className={`flex-1 py-2 px-3 rounded ${
                  timeRange === range.value ? "bg-primary" : "bg-transparent"
                }`}
              >
                <Text
                  className={`text-center text-sm font-medium ${
                    timeRange === range.value ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {range.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="p-4"
          showsVerticalScrollIndicator={false}
        >
          {children(timeRange)}
        </ScrollView>
      </View>
    </Modal>
  );
}
