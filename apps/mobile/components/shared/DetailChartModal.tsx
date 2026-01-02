import { Text } from "@/components/ui/text";
import { X } from "lucide-react-native";
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
  type ModalProps,
} from "react-native";

export type DateRange = "7d" | "30d" | "90d" | "all";

interface DetailChartModalProps extends Omit<ModalProps, "children"> {
  visible: boolean;
  onClose: () => void;
  title: string;
  defaultDateRange?: DateRange;
  showDateRangeSelector?: boolean;
  children: (dateRange: DateRange) => React.ReactNode;
}

export function DetailChartModal({
  visible,
  onClose,
  title,
  defaultDateRange = "30d",
  showDateRangeSelector = true,
  children,
  ...modalProps
}: DetailChartModalProps) {
  const [selectedRange, setSelectedRange] = useState<DateRange>(defaultDateRange);

  const dateRanges: { label: string; value: DateRange }[] = [
    { label: "7D", value: "7d" },
    { label: "30D", value: "30d" },
    { label: "90D", value: "90d" },
    { label: "All", value: "all" },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      {...modalProps}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="border-b border-border bg-card">
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
            <Text className="text-lg font-semibold text-foreground">
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 -mr-2"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={24} className="text-foreground" />
            </TouchableOpacity>
          </View>

          {/* Date Range Selector */}
          {showDateRangeSelector && (
            <View className="px-4 pb-3">
              <View className="flex-row gap-2">
                {dateRanges.map((range) => (
                  <TouchableOpacity
                    key={range.value}
                    onPress={() => setSelectedRange(range.value)}
                    className={`px-4 py-2 rounded-lg ${
                      selectedRange === range.value
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        selectedRange === range.value
                          ? "text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {range.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Content */}
        <ScrollView
          className="flex-1"
          contentContainerClassName="p-4"
          showsVerticalScrollIndicator={false}
        >
          {children(selectedRange)}
        </ScrollView>
      </View>
    </Modal>
  );
}
