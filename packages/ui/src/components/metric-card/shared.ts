import type { IconProps } from "../icon/shared";

export const METRIC_CARD_VARIANT_COLORS = {
  default: "text-card-foreground",
  success: "text-success-subtle-foreground",
  warning: "text-warning-foreground",
  danger: "text-destructive",
} as const;

export interface MetricCardProps {
  icon?: IconProps["as"];
  label: string;
  value: string | number;
  unit?: string;
  comparisonValue?: string | number;
  comparisonLabel?: string;
  subtitle?: string;
  variant?: keyof typeof METRIC_CARD_VARIANT_COLORS;
  color?: string;
}
