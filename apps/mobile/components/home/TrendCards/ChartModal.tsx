import type React from "react";
import { ChartRangeModal, type ChartRangeOption } from "@/components/charts/ChartRangeModal";
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
  const timeRanges: ChartRangeOption<TimeRange>[] = [
    { accessibilityLabel: "Last month", value: "1M", label: "1M" },
    { accessibilityLabel: "Last 3 months", value: "3M", label: "3M" },
    { accessibilityLabel: "Last 6 months", value: "6M", label: "6M" },
    { accessibilityLabel: "Last 12 months", value: "12M", label: "12M" },
    { accessibilityLabel: "All dates", value: "ALL", label: "All" },
  ];

  return (
    <ChartRangeModal
      visible={visible}
      onClose={onClose}
      title={title}
      defaultRange={defaultTimeRange}
      rangeOptions={timeRanges}
    >
      {children}
    </ChartRangeModal>
  );
}
