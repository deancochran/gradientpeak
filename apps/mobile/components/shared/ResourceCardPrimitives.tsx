import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Heart } from "lucide-react-native";
import type { ComponentType, ReactNode } from "react";
import { type AccessibilityState, Pressable, TouchableOpacity, View } from "react-native";
import { formatSmartTimestamp, formatTimestamp } from "@/lib/display/formatters";
import { type EntityOwner, EntityOwnerRow } from "./EntityOwnerRow";

type ResourceCardShellProps = {
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  actionRegion?: ReactNode;
  children: ReactNode;
  cardClassName?: string;
  compact?: boolean;
  contentClassName?: string;
  disabledClassName?: string;
  disabled?: boolean;
  highlighted?: boolean;
  navigationClassName?: string;
  onPress?: () => void;
  testID?: string;
};

type IconComponent = ComponentType<{ className?: string; color?: string; size?: number }>;

type ResourceCardHeaderProps = {
  accessory?: ReactNode;
  compact?: boolean;
  description?: string | null;
  descriptionFallback?: string | null;
  descriptionNumberOfLines?: number;
  detail?: boolean;
  icon?: IconComponent;
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

type ResourceCardActionButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  contentClassName?: string;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
};

/** An accessory must provide its own accessible, independently pressable 44dp target. */
export type ResourceCardAccessory = ReactNode;

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
  categoryItems?: readonly ResourceCategoryItem[];
  categoryIcon?: IconComponent;
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

export type ResourceCategoryItem = {
  icon: IconComponent;
  iconClassName?: string;
  label: string;
};

export function ResourceCategoryItems({
  items,
  testID = "resource-category-items",
}: {
  items: readonly ResourceCategoryItem[];
  testID?: string;
}) {
  if (items.length === 0) return null;

  return (
    <View
      accessibilityLabel={items.map((item) => item.label).join(", ")}
      className="flex-row flex-wrap items-center gap-x-2 gap-y-1"
      testID={testID}
    >
      {items.map((item) => (
        <View className="flex-row items-center gap-1" key={item.label}>
          <Icon
            as={item.icon}
            className={item.iconClassName ?? "text-muted-foreground"}
            size={12}
          />
          <Text className="text-xs text-muted-foreground">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

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

export function ResourceOwnerActionRow({
  actions,
  categoryItems = [],
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
  const hasActions = Boolean(actions);
  const hasSubtitle = Boolean(categoryItems.length || categoryLabel || timestampLabel);
  const displayOwner = owner ?? null;
  const ownerName = displayOwner ? undefined : systemName || fallbackLabel;
  const fallbackInitials = displayOwner ? undefined : "GP";
  const fallbackClassName = displayOwner ? undefined : "bg-primary";

  if (!displayOwner && !hasSubtitle && !actions) {
    return null;
  }

  const subtitle = hasSubtitle ? (
    <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
      {categoryItems.length > 0 ? (
        <ResourceCategoryItems items={categoryItems} />
      ) : (
        <>
          {categoryIcon ? (
            <Icon as={categoryIcon} size={12} className={categoryIconClassName} />
          ) : null}
          {categoryLabel ? (
            <Text className="text-xs text-muted-foreground">{categoryLabel}</Text>
          ) : null}
        </>
      )}
      {(categoryItems.length > 0 || categoryLabel) && timestampLabel ? (
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

      {hasActions ? <View className="shrink-0 flex-row items-center gap-2">{actions}</View> : null}
    </View>
  );
}

export function ResourceCardShell({
  accessibilityLabel,
  accessibilityState,
  actionRegion,
  children,
  cardClassName,
  compact = false,
  contentClassName,
  disabledClassName,
  disabled = false,
  highlighted = false,
  navigationClassName = "gap-3",
  onPress,
  testID,
}: ResourceCardShellProps) {
  const isNavigationControl = Boolean(onPress || accessibilityLabel);
  const Wrapper = isNavigationControl ? TouchableOpacity : View;
  const isDisabled = disabled || !onPress;
  const hasActionRegion =
    actionRegion !== undefined && actionRegion !== null && actionRegion !== false;

  return (
    <Card
      className={`${compact ? "py-2" : "py-3"} ${highlighted ? "border-2 border-primary" : ""} ${disabledClassName ?? ""} ${cardClassName ?? ""}`}
    >
      <CardContent className={contentClassName ?? (compact ? "gap-3 px-2" : "gap-3 px-3")}>
        {hasActionRegion ? (
          <View testID={testID ? `${testID}-action-region` : "resource-card-action-region"}>
            {actionRegion}
          </View>
        ) : null}
        <Wrapper
          accessibilityLabel={isNavigationControl ? accessibilityLabel : undefined}
          accessibilityRole={isNavigationControl ? "button" : undefined}
          accessibilityState={
            isNavigationControl ? { ...accessibilityState, disabled: isDisabled } : undefined
          }
          activeOpacity={isNavigationControl ? 0.85 : 1}
          className={navigationClassName}
          disabled={isDisabled}
          onPress={isDisabled ? undefined : onPress}
          testID={testID}
        >
          {children}
        </Wrapper>
      </CardContent>
    </Card>
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
      accessibilityLabel={
        resolvedLiked ? `Unlike, ${resolvedLikeCount} likes` : `Like, ${resolvedLikeCount} likes`
      }
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || !onPress, selected: resolvedLiked }}
      className="min-h-11 min-w-11 items-center justify-center"
      disabled={disabled || !onPress}
      hitSlop={8}
      onPress={onPress}
      testID={testID}
    >
      <View className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5">
        <Icon
          as={Heart}
          size={14}
          className={resolvedLiked ? "text-red-500 fill-red-500" : "text-muted-foreground"}
        />
        <Text className="ml-1 text-xs font-medium text-muted-foreground">
          {resolvedLikeCount > 0 ? `${resolvedLikeCount}` : resolvedLiked ? "Liked" : "Like"}
        </Text>
      </View>
    </Pressable>
  );
}

export function ResourceCardActionButton({
  accessibilityLabel,
  children,
  contentClassName,
  disabled = false,
  onPress,
  testID,
}: ResourceCardActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="min-h-11 min-w-11 items-center justify-center"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      <View {...(contentClassName !== undefined ? { className: contentClassName } : {})}>
        {children}
      </View>
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
