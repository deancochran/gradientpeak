import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";

import { omitUndefined } from "../../lib/omit-undefined";
import { Button } from "../button/index.web";
import { EmptyStateCard } from "../empty-state-card/index.web";
import { Icon } from "../icon/index.web";
import type { ErrorMessageProps, ErrorStateCardProps } from "./shared";

function ErrorStateCard({
  compact,
  icon = AlertCircleIcon,
  iconColor = "text-destructive",
  iconSize = 48,
  message,
  onRetry,
  retryLabel = "Try Again",
  showRetryButton = true,
  title = "Something went wrong",
  testID,
}: ErrorStateCardProps) {
  return (
    <EmptyStateCard
      {...omitUndefined({
        compact,
        description: message,
        onAction: showRetryButton ? onRetry : undefined,
        testID,
      })}
      actionLabel={retryLabel}
      icon={icon}
      iconColor={iconColor}
      iconSize={iconSize}
      title={title}
      tone="error"
    />
  );
}

function ErrorMessage({ message, onRetry, retryLabel = "Try Again" }: ErrorMessageProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-8" role="alert">
      <Icon as={AlertCircleIcon} className="mb-3 text-destructive" size={40} />
      <p className="mb-1 text-center font-medium text-destructive">Error</p>
      <p className="mb-4 text-center text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry} type="button">
          <RefreshCwIcon className="mr-2 text-foreground" size={14} />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export type { ErrorMessageProps, ErrorStateCardProps } from "./shared";
export { ErrorMessage, ErrorStateCard };
