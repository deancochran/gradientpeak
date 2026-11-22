import type { ComponentType, ReactNode } from "react";

export type ResourceIcon = ComponentType<{ className?: string; color?: string; size?: number }>;

/**
 * Cross-surface resource presentation values. Apps retain domain projection,
 * navigation, unit formatting, maps/charts, and action behavior.
 */
export type ResourceMetric = {
  accessibilityLabel?: string;
  label: string;
  tone?: "default" | "primary" | "muted";
  value: string;
};

export type ResourceCardShellProps = {
  accessibilityLabel?: string;
  accessibilityState?: { disabled?: boolean; selected?: boolean };
  actionRegion?: ReactNode;
  cardClassName?: string;
  children: ReactNode;
  compact?: boolean;
  contentClassName?: string;
  disabled?: boolean;
  disabledClassName?: string;
  highlighted?: boolean;
  navigationClassName?: string;
  onPress?: () => void;
  testID?: string;
};

export type ResourceCardHeaderProps = {
  accessory?: ReactNode;
  compact?: boolean;
  description?: string | null;
  descriptionFallback?: string | null;
  descriptionNumberOfLines?: number;
  detail?: boolean;
  icon?: ResourceIcon;
  iconClassName?: string;
  iconContainerClassName?: string;
  leading?: ReactNode;
  meta?: ReactNode;
  title?: string | null;
  titleContent?: ReactNode;
  titleClassName?: string;
  titleFallback?: string;
  titleNumberOfLines?: number;
};

export type ResourceMetricsRowProps = {
  compact?: boolean;
  maxItems?: number;
  metrics: readonly ResourceMetric[];
  testID?: string;
};

export type ResourceActionRegionProps = {
  children: ReactNode;
  className?: string;
  testID?: string;
};
