import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import type { ComponentType, ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";

type ScreenStateTone = "default" | "error" | "empty";
type IconComponent = ComponentType<{ className?: string; color?: string; size?: number }>;

export type ScreenStateProps = {
  actionLabel?: string;
  children?: ReactNode;
  description?: string | null;
  icon?: IconComponent;
  onAction?: () => void;
  testID?: string;
  title: string;
  tone?: ScreenStateTone;
};

export function ScreenState({
  actionLabel,
  children,
  description,
  icon,
  onAction,
  testID,
  title,
  tone = "default",
}: ScreenStateProps) {
  const isError = tone === "error";

  return (
    <View
      className={`items-center justify-center gap-3 rounded-2xl border px-4 py-8 ${
        isError
          ? "border-destructive/30 bg-destructive/10"
          : "border-dashed border-border bg-card/50"
      }`}
      testID={testID}
    >
      {icon ? (
        <View className="rounded-full bg-muted p-3">
          <Icon
            as={icon}
            size={22}
            className={isError ? "text-destructive" : "text-muted-foreground"}
          />
        </View>
      ) : null}
      <View className="items-center gap-1">
        <Text
          className={`text-center text-base font-semibold ${isError ? "text-destructive" : "text-foreground"}`}
        >
          {title}
        </Text>
        {description ? (
          <Text className="text-center text-sm text-muted-foreground">{description}</Text>
        ) : null}
      </View>
      {children}
      {actionLabel && onAction ? (
        <Button onPress={onAction} variant={isError ? "outline" : "secondary"}>
          <Text className="text-foreground">{actionLabel}</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function LoadingState({
  message = "Loading...",
  testID,
}: {
  message?: string;
  testID?: string;
}) {
  return (
    <View className="items-center justify-center py-8" testID={testID}>
      <ActivityIndicator />
      <Text className="mt-2 text-sm text-muted-foreground">{message}</Text>
    </View>
  );
}

export function EmptyState({
  actionLabel,
  description,
  onAction,
  testID,
  title,
}: Omit<ScreenStateProps, "tone">) {
  return (
    <ScreenState
      actionLabel={actionLabel}
      description={description}
      onAction={onAction}
      testID={testID}
      title={title}
      tone="empty"
    />
  );
}

export function ErrorState({
  actionLabel = "Try again",
  description,
  onAction,
  testID,
  title = "Something went wrong",
}: Partial<Omit<ScreenStateProps, "tone">> & { title?: string }) {
  return (
    <ScreenState
      actionLabel={onAction ? actionLabel : undefined}
      description={description}
      onAction={onAction}
      testID={testID}
      title={title}
      tone="error"
    />
  );
}
