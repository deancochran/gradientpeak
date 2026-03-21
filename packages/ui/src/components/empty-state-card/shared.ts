import type { IconProps } from "../icon/shared";

export interface EmptyStateCardProps {
  icon?: IconProps["as"];
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  iconSize?: number;
  iconColor?: string;
}
