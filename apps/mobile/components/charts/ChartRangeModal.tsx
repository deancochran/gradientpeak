import { Text } from "@repo/ui/components/text";
import { X } from "lucide-react-native";
import type React from "react";
import { useEffect, useState } from "react";
import { Modal, type ModalProps, ScrollView, TouchableOpacity, View } from "react-native";

export type ChartRangeOption<Range extends string> = {
  accessibilityLabel: string;
  label: string;
  value: Range;
};

export interface ChartRangeModalProps<Range extends string> extends Omit<ModalProps, "children"> {
  children: (range: Range) => React.ReactNode;
  closeAccessibilityLabel?: string;
  defaultRange: Range;
  onClose: () => void;
  rangeOptions: readonly ChartRangeOption<Range>[];
  showRangeSelector?: boolean;
  title: string;
  visible: boolean;
}

export function ChartRangeModal<Range extends string>({
  children,
  closeAccessibilityLabel = "Close chart details",
  defaultRange,
  onClose,
  rangeOptions,
  showRangeSelector = true,
  title,
  visible,
  ...modalProps
}: ChartRangeModalProps<Range>) {
  const [selectedRange, setSelectedRange] = useState<Range>(defaultRange);

  useEffect(() => {
    if (visible) setSelectedRange(defaultRange);
  }, [defaultRange, visible]);

  useEffect(() => {
    if (!rangeOptions.some((option) => option.value === selectedRange)) {
      setSelectedRange(defaultRange);
    }
  }, [defaultRange, rangeOptions, selectedRange]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      {...modalProps}
    >
      <View className="flex-1 bg-background" accessibilityViewIsModal>
        <View className="border-b border-border bg-card">
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
            <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={closeAccessibilityLabel}
              className="p-2 -mr-2"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={24} className="text-foreground" />
            </TouchableOpacity>
          </View>

          {showRangeSelector && rangeOptions.length > 0 ? (
            <View className="px-4 pb-2">
              <View className="self-start flex-row rounded-full border border-border/70 bg-muted/20 p-0.5">
                {rangeOptions.map((range) => {
                  const isSelected = selectedRange === range.value;
                  return (
                    <TouchableOpacity
                      key={range.value}
                      onPress={() => setSelectedRange(range.value)}
                      accessibilityRole="button"
                      accessibilityLabel={`${range.accessibilityLabel} range`}
                      accessibilityHint="Updates the chart range."
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
          ) : null}
        </View>

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
