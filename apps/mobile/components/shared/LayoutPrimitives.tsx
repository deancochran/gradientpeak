import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { View } from "react-native";

export function ScreenSection({
  children,
  description,
  testID,
  title,
}: {
  children: ReactNode;
  description?: string | null;
  testID?: string;
  title?: string | null;
}) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card px-4 py-4" testID={testID}>
      {title || description ? (
        <View className="gap-1">
          {title ? <Text className="text-base font-semibold text-foreground">{title}</Text> : null}
          {description ? (
            <Text className="text-sm text-muted-foreground">{description}</Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function SettingsRow({
  accessory,
  description,
  label,
  testID,
}: {
  accessory: ReactNode;
  description?: string | null;
  label: string;
  testID?: string;
}) {
  return (
    <View
      className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3"
      testID={testID}
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {description ? <Text className="text-xs text-muted-foreground">{description}</Text> : null}
      </View>
      {accessory}
    </View>
  );
}

export function InlineNotice({
  children,
  testID,
  tone = "default",
}: {
  children: ReactNode;
  testID?: string;
  tone?: "default" | "error" | "success";
}) {
  const className =
    tone === "error"
      ? "border-destructive/30 bg-destructive/10"
      : tone === "success"
        ? "border-primary/30 bg-primary/10"
        : "border-border bg-muted/40";

  return (
    <View className={`rounded-md border px-3 py-2 ${className}`} testID={testID}>
      {typeof children === "string" ? (
        <Text
          className={
            tone === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
