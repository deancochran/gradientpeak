import { AlertCircle, type LucideIcon, RefreshCw } from "lucide-react-native";
import * as React from "react";

import { View } from "../../lib/react-native";
import { Button } from "../button/index.native";
import { Card, CardContent } from "../card/index.native";
import { Text } from "../text/index.native";

export interface ErrorStateCardProps {
  icon?: LucideIcon;
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  iconSize?: number;
  iconColor?: string;
  showRetryButton?: boolean;
}

export function ErrorStateCard({
  icon: Icon = AlertCircle,
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try Again",
  iconSize = 48,
  iconColor = "text-destructive",
  showRetryButton = true,
}: ErrorStateCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-12">
        <View className="items-center justify-center gap-4">
          <View className="items-center justify-center">
            <Icon size={iconSize} className={iconColor} strokeWidth={1.5} />
          </View>
          <View className="items-center gap-2">
            <Text className="text-lg font-semibold text-center text-foreground">{title}</Text>
            <Text className="text-sm text-center text-muted-foreground max-w-[280px]">
              {message}
            </Text>
          </View>
          {showRetryButton && onRetry ? (
            <Button variant="outline" onPress={onRetry} className="mt-2">
              <RefreshCw size={16} className="text-foreground mr-2" />
              <Text>{retryLabel}</Text>
            </Button>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

export function getErrorMessage(error: unknown): string {
  if (!error) return "An unexpected error occurred";
  if (typeof error === "string") return error;

  if (error instanceof Error) {
    if (error.message.includes("Network") || error.message.includes("fetch")) {
      return "Unable to connect. Please check your internet connection.";
    }
    if (error.message.includes("timeout")) {
      return "Request timed out. Please try again.";
    }
    if (error.message.includes("permission") || error.message.includes("unauthorized")) {
      return "You don't have permission to access this resource.";
    }
    if (error.message.includes("not found") || error.message.includes("404")) {
      return "The requested resource was not found.";
    }

    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const err = error as {
      data?: { code?: string };
      message?: string;
    };

    if (err.data?.code === "UNAUTHORIZED") {
      return "Please sign in to continue.";
    }
    if (err.data?.code === "FORBIDDEN") {
      return "You don't have permission to perform this action.";
    }
    if (err.data?.code === "NOT_FOUND") {
      return "The requested resource was not found.";
    }
    if (err.data?.code === "TOO_MANY_REQUESTS") {
      return "Too many requests. Please wait a moment and try again.";
    }
    if (err.message) return err.message;
  }

  return "An unexpected error occurred. Please try again.";
}

export function ErrorMessage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = getErrorMessage(error);

  return (
    <View className="items-center justify-center py-8 px-6">
      <AlertCircle size={40} className="text-destructive mb-3" strokeWidth={1.5} />
      <Text className="text-center text-destructive mb-1 font-medium">Error</Text>
      <Text className="text-center text-muted-foreground text-sm mb-4">{message}</Text>
      {onRetry ? (
        <Button variant="outline" size="sm" onPress={onRetry}>
          <RefreshCw size={14} className="text-foreground mr-2" />
          <Text>Try Again</Text>
        </Button>
      ) : null}
    </View>
  );
}
