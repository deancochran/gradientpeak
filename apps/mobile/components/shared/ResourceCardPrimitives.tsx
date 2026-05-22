import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { differenceInHours, format, formatDistanceToNow } from "date-fns";
import { Heart } from "lucide-react-native";
import type { ComponentType, ReactNode } from "react";
import { Pressable, TouchableOpacity, View } from "react-native";
import { type EntityOwner, EntityOwnerRow } from "./EntityOwnerRow";

type ResourceCardShellProps = {
  children: ReactNode;
  cardClassName?: string;
  compact?: boolean;
  contentClassName?: string;
  disabledClassName?: string;
  highlighted?: boolean;
  onPress?: () => void;
  testID?: string;
};

type ResourceCardHeaderProps = {
  accessory?: ReactNode;
  compact?: boolean;
  description?: string | null;
  descriptionFallback?: string | null;
  descriptionNumberOfLines?: number;
  detail?: boolean;
  icon?: ComponentType<any>;
  iconClassName?: string;
  iconContainerClassName?: string;
  meta?: ReactNode;
  title?: string | null;
  titleFallback: string;
  titleClassName?: string;
  titleNumberOfLines?: number;
};

type ResourceLikeButtonProps = {
  disabled?: boolean;
  isLiked?: boolean | null;
  likeCount?: number | null;
  onPress?: () => void;
  testID?: string;
};

type ResourceAttributionRowProps = {
  compact?: boolean;
  endAccessory?: ReactNode;
  fallbackLabel?: string;
  onOwnerPress?: () => void;
  owner?: EntityOwner | null;
  timestamp?: string | Date | null;
  timestampPrefix?: string;
  testID?: string;
};

type ResourceOwnerActionRowProps = {
  actions?: ReactNode;
  categoryIcon?: ComponentType<any>;
  categoryIconClassName?: string;
  categoryLabel?: string | null;
  compact?: boolean;
  fallbackLabel?: string;
  onOwnerPress?: () => void;
  owner?: EntityOwner | null;
  systemName?: string;
  timestamp?: string | Date | null;
  testID?: string;
};

export type ResourceMetric = {
  label: string;
  tone?: "default" | "primary" | "muted";
  value: string;
};

type ResourceMetricsRowProps = {
  compact?: boolean;
  maxItems?: number;
  metrics: ResourceMetric[];
  testID?: string;
};

export type ResourceTag = {
  label: string;
  testID?: string;
};

type ResourceTagRowProps = {
  tags: ResourceTag[];
  testID?: string;
};

function formatTimestamp(timestamp?: string | Date | null, prefix = "Updated") {
  if (!timestamp) return null;

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  return `${prefix} ${format(date, "MMM d, yyyy")}`;
}

function formatSmartTimestamp(timestamp?: string | Date | null) {
  if (!timestamp) return null;

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  const hoursAgo = differenceInHours(new Date(), date);

  if (hoursAgo >= 0 && hoursAgo < 24) {
    return formatDistanceToNow(date, { addSuffix: true });
  }

  if (hoursAgo >= 24 && hoursAgo < 48) {
    return `Yesterday at ${format(date, "h:mm a")}`;
  }

  return format(date, "MMM d, yyyy • h:mm a");
}

export function ResourceOwnerActionRow({
  actions,
  categoryIcon,
  categoryIconClassName = "text-muted-foreground",
  categoryLabel,
  compact = false,
  fallbackLabel = "GradientPeak",
  onOwnerPress,
  owner,
  systemName = "GradientPeak",
  timestamp,
  testID = "resource-owner-action-row",
}: ResourceOwnerActionRowProps) {
  const timestampLabel = formatSmartTimestamp(timestamp);
  const hasSubtitle = Boolean(categoryLabel || timestampLabel);
  const displayOwner = owner ?? null;
  const ownerName = displayOwner ? undefined : systemName || fallbackLabel;
  const fallbackInitials = displayOwner ? undefined : "GP";
  const fallbackClassName = displayOwner ? undefined : "bg-primary";

  if (!displayOwner && !hasSubtitle && !actions) {
    return null;
  }

  const subtitle = hasSubtitle ? (
    <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
      {categoryIcon ? <Icon as={categoryIcon} size={12} className={categoryIconClassName} /> : null}
      {categoryLabel ? (
        <Text className="text-xs text-muted-foreground">{categoryLabel}</Text>
      ) : null}
      {categoryLabel && timestampLabel ? (
        <Text className="text-xs text-muted-foreground">•</Text>
      ) : null}
      {timestampLabel ? (
        <Text className="text-xs text-muted-foreground">{timestampLabel}</Text>
      ) : null}
    </View>
  ) : null;

  return (
    <View className="flex-row items-start justify-between gap-3" testID={testID}>
      <View className="min-w-0 flex-1">
        <EntityOwnerRow
          compact={compact}
          displayNameOverride={ownerName}
          fallbackClassName={fallbackClassName}
          fallbackInitials={fallbackInitials}
          minimal
          onPress={onOwnerPress}
          owner={displayOwner}
          subtitle={subtitle}
        />
      </View>

      {actions ? <View className="shrink-0 flex-row items-center gap-2">{actions}</View> : null}
    </View>
  );
}

export function ResourceCardShell({
  children,
  cardClassName,
  compact = false,
  contentClassName,
  disabledClassName,
  highlighted = false,
  onPress,
  testID,
}: ResourceCardShellProps) {
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
      onPress={onPress}
      testID={testID}
    >
      <Card
        className={`${compact ? "py-2" : "py-3"} ${highlighted ? "border-2 border-primary" : ""} ${disabledClassName ?? ""} ${cardClassName ?? ""}`}
      >
        <CardContent className={contentClassName ?? (compact ? "gap-3 px-2" : "gap-3 px-3")}>
          {children}
        </CardContent>
      </Card>
    </Wrapper>
  );
}

export function ResourceCardHeader({
  accessory,
  compact = false,
  description,
  descriptionFallback,
  descriptionNumberOfLines,
  detail = false,
  icon,
  iconClassName = "text-primary",
  iconContainerClassName = "bg-primary/10",
  meta,
  title,
  titleClassName,
  titleFallback,
  titleNumberOfLines,
}: ResourceCardHeaderProps) {
  const resolvedDescription = description?.trim() || descriptionFallback?.trim() || null;
  const IconComponent = icon;

  return (
    <View className="flex-row items-start gap-3">
      {IconComponent ? (
        <View className={`rounded-full p-2.5 ${iconContainerClassName}`}>
          <Icon as={IconComponent} size={compact ? 16 : 18} className={iconClassName} />
        </View>
      ) : null}

      <View className="min-w-0 flex-1 gap-1">
        <Text
          className={
            titleClassName ??
            `${detail ? "text-xl" : compact ? "text-lg" : "text-xl"} font-semibold text-foreground`
          }
          numberOfLines={titleNumberOfLines ?? (detail ? undefined : 2)}
        >
          {title?.trim() || titleFallback}
        </Text>
        {resolvedDescription ? (
          <Text
            className="text-sm leading-5 text-muted-foreground"
            numberOfLines={descriptionNumberOfLines ?? (detail ? undefined : 2)}
          >
            {resolvedDescription}
          </Text>
        ) : null}
        {meta}
      </View>

      {accessory}
    </View>
  );
}

export function ResourceMetricsRow({
  compact = false,
  maxItems,
  metrics,
  testID,
}: ResourceMetricsRowProps) {
  const visibleMetrics = metrics.slice(0, maxItems ?? (compact ? 3 : metrics.length));

  if (visibleMetrics.length === 0) {
    return null;
  }

  return (
    <View className="flex-row flex-wrap items-start gap-x-5 gap-y-2 px-1" testID={testID}>
      {visibleMetrics.map((metric) => (
        <View key={metric.label} className="items-start gap-0.5">
          <Text className="text-[10px] text-muted-foreground">{metric.label}</Text>
          <Text
            className={`text-[11px] font-semibold ${
              metric.tone === "primary"
                ? "text-primary"
                : metric.tone === "muted"
                  ? "text-muted-foreground"
                  : "text-foreground"
            }`}
            numberOfLines={1}
          >
            {metric.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ResourceTagRow({ tags, testID }: ResourceTagRowProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <View className="flex-row flex-wrap gap-2" testID={testID}>
      {tags.map((tag) => (
        <View key={tag.label} className="rounded-full bg-muted/80 px-2 py-1" testID={tag.testID}>
          <Text className="text-[10px] font-medium text-muted-foreground">{tag.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function ResourceLikeButton({
  disabled = false,
  isLiked = false,
  likeCount = 0,
  onPress,
  testID,
}: ResourceLikeButtonProps) {
  const resolvedLikeCount = likeCount ?? 0;
  const resolvedLiked = Boolean(isLiked);

  return (
    <Pressable
      className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5"
      disabled={disabled || !onPress}
      onPress={(event) => {
        event?.stopPropagation?.();
        onPress?.();
      }}
      testID={testID}
    >
      <Icon
        as={Heart}
        size={14}
        className={resolvedLiked ? "text-red-500 fill-red-500" : "text-muted-foreground"}
      />
      <Text className="ml-1 text-xs font-medium text-muted-foreground">
        {resolvedLikeCount > 0 ? `${resolvedLikeCount}` : resolvedLiked ? "Liked" : "Like"}
      </Text>
    </Pressable>
  );
}

export function ResourceAttributionRow({
  compact = false,
  endAccessory,
  fallbackLabel = "System Template",
  onOwnerPress,
  owner,
  timestamp,
  timestampPrefix = "Updated",
  testID = "resource-attribution-row",
}: ResourceAttributionRowProps) {
  const timestampLabel = formatTimestamp(timestamp, timestampPrefix);

  if (!owner && !timestampLabel && !endAccessory) {
    return null;
  }

  return (
    <View className="mt-3 flex-row items-end justify-between gap-3" testID={testID}>
      <View className="min-w-0 flex-1">
        {owner ? (
          <EntityOwnerRow compact={compact} minimal onPress={onOwnerPress} owner={owner} />
        ) : (
          <Text
            className={
              compact
                ? "text-xs font-medium text-muted-foreground"
                : "text-sm font-medium text-muted-foreground"
            }
            numberOfLines={1}
          >
            {fallbackLabel}
          </Text>
        )}
      </View>
      {endAccessory ??
        (timestampLabel ? (
          <Text className="shrink-0 text-[10px] text-muted-foreground" numberOfLines={1}>
            {timestampLabel}
          </Text>
        ) : null)}
    </View>
  );
}
