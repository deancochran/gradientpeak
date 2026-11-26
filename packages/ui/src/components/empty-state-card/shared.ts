import type { ReactNode } from "react";
import type { IconProps } from "../icon/shared";

export type EmptyStateTone = "empty" | "error" | "denied" | "unavailable";

export interface EmptyStateCardProps {
  icon?: IconProps["as"];
  title: string;
  description?: string | null;
  children?: ReactNode;
  /** Compact feedback within an existing task surface rather than a full-page state. */
  compact?: boolean;
  testID?: string;
  actionLabel?: string;
  onAction?: () => void;
  iconSize?: number;
  iconColor?: string;
  /**
   * Describes the reason this state is shown. Callers retain ownership of retry
   * behavior and authorization decisions.
   */
  tone?: EmptyStateTone;
}

export const emptyStateToneClassNames: Record<EmptyStateTone, string> = {
  empty: "border-border bg-card",
  error: "border-destructive/50 bg-destructive/10",
  denied: "border-warning/50 bg-warning/10",
  unavailable: "border-warning/50 bg-card",
};
