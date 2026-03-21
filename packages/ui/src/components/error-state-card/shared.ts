import type { IconProps } from "../icon/shared";

export interface ErrorStateCardProps {
  icon?: IconProps["as"];
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  iconSize?: number;
  iconColor?: string;
  showRetryButton?: boolean;
}

export interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}
