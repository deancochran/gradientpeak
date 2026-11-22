import type { IconProps } from "../icon/shared";

export type EmptyStateTone = "empty" | "error" | "denied" | "unavailable";

export interface EmptyStateCardProps {
  icon?: IconProps["as"];
  title: string;
  description: string;
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
