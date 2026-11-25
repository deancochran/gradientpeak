import type { EmptyStateCardProps } from "../empty-state-card/shared";

export interface ErrorStateCardProps
  extends Pick<EmptyStateCardProps, "icon" | "iconSize" | "iconColor" | "compact" | "testID"> {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  showRetryButton?: boolean;
}

export interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}
