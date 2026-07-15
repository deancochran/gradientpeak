import type React from "react";

export type ChartLegendItem = {
  color: string;
  id: string;
  label: string;
};

export type ChartSummaryItem = {
  label: string;
  value: string;
};

export type ChartCardProps = {
  children: React.ReactNode;
  className?: string;
  description?: string;
  legend?: readonly ChartLegendItem[];
  summary?: readonly ChartSummaryItem[];
  testId?: string;
  title: string;
};

export type ChartEmptyStateProps = {
  message: string;
  testId?: string;
};

export function getChartAccessibilityLabel(
  title: string,
  summary: readonly ChartSummaryItem[] = [],
) {
  return [title, ...summary.map((item) => `${item.label}: ${item.value}`)].join(". ");
}
