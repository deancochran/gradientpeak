import { Text } from "@repo/ui/components/text";
import type React from "react";
import { ActivityIndicator, View } from "react-native";

type TrainingPathWeekReviewShellProps = {
  action?: React.ReactNode;
  body?: string | null;
  children: React.ReactNode;
  dateLabel?: string | null;
  loading?: boolean;
  loadingChildren?: React.ReactNode;
  testID?: string;
  title?: string;
};

export function TrainingPathWeekReviewSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View className="gap-2">
      <Text className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function TrainingPathWeekReviewEmptyRow({ children }: { children: string }) {
  return <Text className="text-xs text-muted-foreground">{children}</Text>;
}

export function TrainingPathWeekReviewShell({
  action,
  body,
  children,
  dateLabel,
  loading = false,
  loadingChildren,
  testID = "training-path-week-summary",
  title = "Week Review",
}: TrainingPathWeekReviewShellProps) {
  return (
    <View className="gap-4" testID={loading ? `${testID}-loading` : testID}>
      <View className="gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <Text className="text-sm font-semibold text-foreground">{title}</Text>
            {loading ? (
              <ActivityIndicator size="small" testID={`${testID}-loading-indicator`} />
            ) : null}
          </View>
          <View className="flex-row items-center gap-2">
            {dateLabel ? (
              <Text className="text-xs font-medium text-muted-foreground" numberOfLines={1}>
                {dateLabel}
              </Text>
            ) : null}
            {action}
          </View>
        </View>
        {!loading && body ? (
          <Text className="text-xs leading-5 text-muted-foreground">{body}</Text>
        ) : null}
      </View>
      {loading ? loadingChildren : children}
    </View>
  );
}
