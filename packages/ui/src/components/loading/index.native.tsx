import type * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { cn } from "../../lib/cn";
import { Button, type ButtonProps } from "../button/index.native";
import { Text } from "../text/index.native";

export type SpinnerProps = React.ComponentProps<typeof ActivityIndicator> & {
  label?: string;
};

export function Spinner({ label = "Loading", ...props }: SpinnerProps) {
  return (
    <ActivityIndicator accessibilityLabel={label} accessibilityRole="progressbar" {...props} />
  );
}

export type LoadingButtonProps = ButtonProps & {
  loading?: boolean;
  loadingLabel?: React.ReactNode;
  loadingTextClassName?: string;
  spinnerPlacement?: "start" | "end";
};

export function LoadingButton({
  children,
  disabled,
  loading = false,
  loadingLabel,
  loadingTextClassName,
  spinnerPlacement = "start",
  ...props
}: LoadingButtonProps) {
  const label = loading && loadingLabel ? loadingLabel : children;
  const content = typeof label === "function" ? null : label;

  return (
    <Button
      accessibilityState={{ busy: loading, disabled: disabled || loading }}
      disabled={disabled || loading}
      {...props}
    >
      <View className="flex-row items-center justify-center gap-2">
        {loading && spinnerPlacement === "start" ? <Spinner size="small" /> : null}
        {typeof content === "string" ? (
          <Text
            className={cn("text-sm font-semibold text-primary-foreground", loadingTextClassName)}
          >
            {content}
          </Text>
        ) : (
          content
        )}
        {loading && spinnerPlacement === "end" ? <Spinner size="small" /> : null}
      </View>
    </Button>
  );
}

export type InlineLoadingStatusProps = React.ComponentProps<typeof View> & {
  loading?: boolean;
  label?: string;
  textClassName?: string;
};

export function InlineLoadingStatus({
  className,
  label = "Loading...",
  loading = true,
  textClassName,
  ...props
}: InlineLoadingStatusProps) {
  if (!loading) return null;

  return (
    <View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      className={cn("flex-row items-center gap-2", className)}
      {...props}
    >
      <Spinner size="small" />
      <Text className={cn("text-xs text-muted-foreground", textClassName)}>{label}</Text>
    </View>
  );
}
