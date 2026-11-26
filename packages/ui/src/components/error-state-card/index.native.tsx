import { AlertCircle, RefreshCw } from "lucide-react-native";
import { View } from "react-native";

import { omitUndefined } from "../../lib/omit-undefined";
import { Button } from "../button/index.native";
import { EmptyStateCard } from "../empty-state-card/index.native";
import { Text } from "../text/index.native";
import type { ErrorMessageProps, ErrorStateCardProps } from "./shared";

function ErrorStateCard({
  compact,
  icon: Icon = AlertCircle,
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
      icon={Icon}
      iconColor={iconColor}
      iconSize={iconSize}
      title={title}
      tone="error"
    />
  );
}

function ErrorMessage({ message, onRetry, retryLabel = "Try Again" }: ErrorMessageProps) {
  return (
    <View accessibilityLiveRegion="assertive" className="items-center justify-center px-6 py-8">
      <AlertCircle className="mb-3 text-destructive" size={40} strokeWidth={1.5} />
      <Text className="mb-1 text-center font-medium text-destructive">Error</Text>
      <Text className="mb-4 text-center text-sm text-muted-foreground">{message}</Text>
      {onRetry ? (
        <Button size="sm" variant="outline" onPress={onRetry}>
          <RefreshCw className="mr-2 text-foreground" size={14} />
          <Text>{retryLabel}</Text>
        </Button>
      ) : null}
    </View>
  );
}

export type { ErrorMessageProps, ErrorStateCardProps } from "./shared";
export { ErrorMessage, ErrorStateCard };
