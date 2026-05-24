import { Text } from "@repo/ui/components/text";
import { X } from "lucide-react-native";
import type React from "react";
import { useState } from "react";
import { Modal, type ModalProps, ScrollView, TouchableOpacity, View } from "react-native";

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

  const dateRanges: { accessibilityLabel: string; label: string; value: DateRange }[] = [
    { accessibilityLabel: "Last 7 days", label: "7D", value: "7d" },
    { accessibilityLabel: "Last 30 days", label: "30D", value: "30d" },
    { accessibilityLabel: "Last 90 days", label: "90D", value: "90d" },
    { accessibilityLabel: "All dates", label: "All", value: "all" },
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
            <Text className="text-lg font-semibold text-foreground">{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close chart details"
              className="p-2 -mr-2"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={24} className="text-foreground" />
            </TouchableOpacity>
          </View>

          {/* Date Range Selector */}
          {showDateRangeSelector && (
            <View className="px-4 pb-2">
              <View className="self-start flex-row rounded-full border border-border/70 bg-muted/20 p-0.5">
                {dateRanges.map((range) => {
                  const isSelected = selectedRange === range.value;

                  return (
                    <TouchableOpacity
                      key={range.value}
                      onPress={() => setSelectedRange(range.value)}
                      accessibilityRole="button"
                      accessibilityLabel={`${range.accessibilityLabel} range`}
                      accessibilityHint="Updates the chart date range."
                      accessibilityState={{ selected: isSelected }}
                      className={`rounded-full px-3 py-1.5 ${isSelected ? "bg-background" : "bg-transparent"}`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          isSelected ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {range.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
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
