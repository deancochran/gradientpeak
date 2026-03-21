import { AlertCircle, RefreshCw } from "lucide-react-native";
import { View } from "react-native";

import { Button } from "../button/index.native";
import { Card, CardContent } from "../card/index.native";
import { Text } from "../text/index.native";
import type { ErrorMessageProps, ErrorStateCardProps } from "./shared";

function ErrorStateCard({
  icon: Icon = AlertCircle,
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
        <View className="items-center justify-center gap-4">
          <View className="items-center justify-center">
            <Icon className={iconColor} size={iconSize} strokeWidth={1.5} />
          </View>
          <View className="items-center gap-2">
            <Text className="text-center text-lg font-semibold text-foreground">{title}</Text>
            <Text className="max-w-[280px] text-center text-sm text-muted-foreground">
              {message}
            </Text>
          </View>
          {showRetryButton && onRetry ? (
            <Button className="mt-2" onPress={onRetry} variant="outline">
              <RefreshCw className="mr-2 text-foreground" size={16} />
              <Text>{retryLabel}</Text>
            </Button>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

function ErrorMessage({ message, onRetry, retryLabel = "Try Again" }: ErrorMessageProps) {
  return (
    <View className="items-center justify-center px-6 py-8">
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
