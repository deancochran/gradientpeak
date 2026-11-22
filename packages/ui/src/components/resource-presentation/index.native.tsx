import { Pressable, View } from "react-native";
import { Card, CardContent } from "../card/index.native";
import { Icon } from "../icon/index.native";
import { Text } from "../text/index.native";
import type {
  ResourceActionRegionProps,
  ResourceAssociationProps,
  ResourceCardHeaderProps,
  ResourceCardShellProps,
  ResourceMetricsRowProps,
} from "./shared";

export function ResourceActionRegion({ children, className, testID }: ResourceActionRegionProps) {
  return (
    <View className={`flex-row items-center gap-2 ${className ?? ""}`} testID={testID}>
      {children}
    </View>
  );
}

export function ResourceAssociation({
  children,
  description,
  label,
  status,
  testID,
}: ResourceAssociationProps) {
  return (
    <View className="gap-2" testID={testID}>
      <View className="flex-row flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-foreground">{label}</Text>
          {description ? (
            <Text className="text-xs text-muted-foreground">{description}</Text>
          ) : null}
        </View>
        {status ? <Text className="text-xs text-muted-foreground">{status}</Text> : null}
      </View>
      {children}
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
  const Wrapper = isNavigationControl ? Pressable : View;
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
          className={navigationClassName}
          disabled={isDisabled}
          onPress={isDisabled ? undefined : onPress}
          style={({ pressed }) => ({
            minHeight: 44,
            minWidth: 44,
            ...(pressed && !isDisabled ? { opacity: 0.85 } : {}),
          })}
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
  leading,
  meta,
  title,
  titleClassName,
  titleContent,
  titleFallback,
  titleNumberOfLines,
}: ResourceCardHeaderProps) {
  const resolvedDescription = description?.trim() || descriptionFallback?.trim() || null;
  const resolvedTitle = title?.trim() || titleFallback?.trim() || null;

  return (
    <View className="flex-row items-start gap-3">
      {leading ??
        (icon ? (
          <View className={`rounded-full p-2.5 ${iconContainerClassName}`}>
            <Icon as={icon} className={iconClassName} size={compact ? 16 : 18} />
          </View>
        ) : null)}
      <View className="min-w-0 flex-1 gap-1">
        {(titleContent ?? resolvedTitle) ? (
          <Text
            className={
              titleClassName ??
              `${detail ? "text-xl" : compact ? "text-lg" : "text-xl"} font-semibold text-foreground`
            }
            numberOfLines={titleNumberOfLines ?? (detail ? undefined : 2)}
          >
            {titleContent ?? resolvedTitle}
          </Text>
        ) : null}
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
  const visibleMetrics = metrics.slice(0, maxItems ?? metrics.length);
  if (visibleMetrics.length === 0) return null;

  return (
    <View
      className={`flex-row flex-wrap items-start gap-y-2 px-1 ${compact ? "gap-x-4" : "gap-x-5"}`}
      testID={testID}
    >
      {visibleMetrics.map((metric) => (
        <View key={metric.label} className="items-start gap-0.5">
          <Text className="text-[10px] text-muted-foreground">{metric.label}</Text>
          <Text
            accessibilityLabel={metric.accessibilityLabel}
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

export type {
  ResourceActionRegionProps,
  ResourceAssociationProps,
  ResourceCardHeaderProps,
  ResourceCardShellProps,
  ResourceMetric,
  ResourceMetricsRowProps,
} from "./shared";
