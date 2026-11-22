import { EmptyStateCard, type EmptyStateCardProps } from "@repo/ui/components/empty-state-card";
import { InlineLoadingStatus } from "@repo/ui/components/loading";
import { View } from "react-native";
import { omitUndefined } from "@/lib/omitUndefined";

type ScreenStateTone = "default" | "denied" | "error" | "empty";
export type ScreenStateProps = Omit<
  EmptyStateCardProps,
  "tone" | "compact" | "iconColor" | "iconSize"
> & {
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
  return (
    <EmptyStateCard
      {...omitUndefined({ actionLabel, description, icon, onAction, testID })}
      compact
      iconSize={22}
      title={title}
      tone={tone === "default" ? "empty" : tone}
    >
      {children}
    </EmptyStateCard>
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
      <InlineLoadingStatus className="flex-col gap-2" label={message} textClassName="text-sm" />
    </View>
  );
}

export function EmptyState(props: Omit<ScreenStateProps, "tone">) {
  return <ScreenState {...props} tone="empty" />;
}

export function ErrorState({
  actionLabel = "Try again",
  onAction,
  title = "Something went wrong",
  ...props
}: Partial<Omit<ScreenStateProps, "tone">> & { title?: string }) {
  return (
    <ScreenState
      {...props}
      {...omitUndefined({ actionLabel: onAction ? actionLabel : undefined, onAction })}
      title={title}
      tone="error"
    />
  );
}

/** Use for an authorization result, never to represent an empty or failed query. */
export function DeniedState({
  title = "Access unavailable",
  ...props
}: Partial<Omit<ScreenStateProps, "tone">> & { title?: string }) {
  return <ScreenState {...props} title={title} tone="denied" />;
}
