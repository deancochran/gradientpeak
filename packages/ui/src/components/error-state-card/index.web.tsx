import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "../button/index.web";
import { Card, CardContent } from "../card/index.web";
import { Icon } from "../icon/index.web";
import type { ErrorMessageProps, ErrorStateCardProps } from "./shared";

function ErrorStateCard({
  icon = AlertCircleIcon,
  iconColor = "text-destructive",
  iconSize = 48,
  message,
  onRetry,
  retryLabel = "Try Again",
  showRetryButton = true,
  title = "Something went wrong",
}: ErrorStateCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="py-12">
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center justify-center">
            <Icon as={icon} className={iconColor} size={iconSize} />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-center text-lg font-semibold text-foreground">{title}</p>
            <p className="max-w-[280px] text-center text-sm text-muted-foreground">{message}</p>
          </div>
          {showRetryButton && onRetry ? (
            <Button className="mt-2" onClick={onRetry} variant="outline">
              <RefreshCwIcon className="mr-2 text-foreground" size={16} />
              {retryLabel}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorMessage({ message, onRetry, retryLabel = "Try Again" }: ErrorMessageProps) {
  return (
    <div className="flex items-center justify-center px-6 py-8">
      <Icon as={AlertCircleIcon} className="mb-3 text-destructive" size={40} />
      <p className="mb-1 text-center font-medium text-destructive">Error</p>
      <p className="mb-4 text-center text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCwIcon className="mr-2 text-foreground" size={14} />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export type { ErrorMessageProps, ErrorStateCardProps } from "./shared";
export { ErrorMessage, ErrorStateCard };
