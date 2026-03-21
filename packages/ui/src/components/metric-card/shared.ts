import type { IconProps } from "../icon/shared";

export interface MetricCardProps {
  icon?: IconProps["as"];
  label: string;
  value: string | number;
  unit?: string;
  comparisonValue?: string | number;
  comparisonLabel?: string;
  subtitle?: string;
  variant?: "default" | "success" | "warning" | "danger";
  color?: string;
}
