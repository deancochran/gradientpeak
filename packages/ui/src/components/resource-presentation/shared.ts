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

/**
 * A non-interactive frame for an already-selected resource. Apps retain picker,
 * query, and navigation behavior while the association stays visually distinct.
 */
export type ResourceAssociationProps = {
  children?: ReactNode;
  description?: string;
  label: string;
  status?: string;
  testID?: string;
};

export type ResourceSelectionOption<T extends string = string> = {
  label: string;
  value: T;
};

/**
 * A native-select resource choice with an explicit automatic option and a
 * retained fallback for selections outside the current result page.
 */
export type ResourceSelectionFieldProps<T extends string = string> = {
  automaticLabel: string;
  disabled?: boolean;
  fallbackLabel?: string;
  id: string;
  label: string;
  onChange: (value: T | null) => void;
  options: readonly ResourceSelectionOption<T>[];
  unavailableMessage?: string;
  value: T | null;
};
