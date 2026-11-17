import type React from "react";
import type { ModalProps } from "react-native";
import { ChartRangeModal, type ChartRangeOption } from "@/components/charts/ChartRangeModal";

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
  const dateRanges: ChartRangeOption<DateRange>[] = [
    { accessibilityLabel: "Last 7 days", label: "7D", value: "7d" },
    { accessibilityLabel: "Last 30 days", label: "30D", value: "30d" },
    { accessibilityLabel: "Last 90 days", label: "90D", value: "90d" },
    { accessibilityLabel: "All dates", label: "All", value: "all" },
  ];

  return (
    <ChartRangeModal
      visible={visible}
      onClose={onClose}
      title={title}
      defaultRange={defaultDateRange}
      rangeOptions={dateRanges}
      showRangeSelector={showDateRangeSelector}
      {...modalProps}
    >
      {children}
    </ChartRangeModal>
  );
}
