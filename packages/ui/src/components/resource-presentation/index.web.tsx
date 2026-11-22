import { cn } from "../../lib/cn";
import { Card, CardContent } from "../card/index.web";
import type {
  ResourceActionRegionProps,
  ResourceCardHeaderProps,
  ResourceCardShellProps,
  ResourceMetricsRowProps,
} from "./shared";

export function ResourceActionRegion({ children, className, testID }: ResourceActionRegionProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} data-testid={testID}>
      {children}
    </div>
  );
}

/**
 * The shell intentionally keeps actions outside its optional primary Pressable.
 * Web navigation remains app-owned so callers can use their router Link.
 */
export function ResourceCardShell({
  actionRegion,
  accessibilityState,
  children,
  cardClassName,
  compact = false,
  contentClassName,
  disabledClassName,
  disabled = false,
  highlighted = false,
  navigationClassName,
  onPress,
  testID,
  accessibilityLabel,
}: ResourceCardShellProps) {
  const hasActionRegion =
    actionRegion !== undefined && actionRegion !== null && actionRegion !== false;

  return (
    <Card
      className={cn(
        compact ? "py-2" : "py-3",
        highlighted && "border-2 border-primary",
        disabled && "cursor-not-allowed opacity-60",
        disabledClassName,
        cardClassName,
      )}
      data-testid={testID}
    >
      <CardContent className={cn(contentClassName ?? (compact ? "gap-3 px-2" : "gap-3 px-3"))}>
        {hasActionRegion ? (
          <ResourceActionRegion testID={testID ? `${testID}-action-region` : undefined}>
            {actionRegion}
          </ResourceActionRegion>
        ) : null}
        {onPress ? (
          <button
            aria-label={accessibilityLabel}
            aria-pressed={accessibilityState?.selected}
            className={cn("w-full text-left", navigationClassName)}
            disabled={disabled}
            onClick={onPress}
            type="button"
          >
            {children}
          </button>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function ResourceCardHeader({
  accessory,
  compact = false,
  description,
  descriptionFallback,
  detail = false,
  icon: _icon,
  iconClassName: _iconClassName,
  iconContainerClassName: _iconContainerClassName,
  leading,
  meta,
  title,
  titleClassName,
  titleFallback,
}: ResourceCardHeaderProps) {
  const resolvedDescription = description?.trim() || descriptionFallback?.trim() || null;
  const resolvedTitle = title?.trim() || titleFallback?.trim() || null;
  const Title = detail ? "h2" : "h3";

  return (
    <div className="flex items-start gap-3">
      {leading}
      <div className="min-w-0 flex-1 space-y-1">
        {resolvedTitle ? (
          <Title
            className={cn(
              detail ? "text-xl" : compact ? "text-lg" : "text-xl",
              "font-semibold text-foreground",
              titleClassName,
            )}
          >
            {resolvedTitle}
          </Title>
        ) : null}
        {resolvedDescription ? (
          <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
            {resolvedDescription}
          </p>
        ) : null}
        {meta}
      </div>
      {accessory}
    </div>
  );
}

export function ResourceMetricsRow({
  compact = false,
  maxItems,
  metrics,
  testID,
}: ResourceMetricsRowProps) {
  const visibleMetrics = metrics.slice(0, maxItems ?? (compact ? 3 : metrics.length));
  if (visibleMetrics.length === 0) return null;

  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-2 px-1" data-testid={testID}>
      {visibleMetrics.map((metric) => (
        <fieldset
          aria-label={metric.accessibilityLabel ?? `${metric.label}, ${metric.value}`}
          className="m-0 min-w-0 border-0 p-0"
          key={metric.label}
        >
          <p className="text-[10px] text-muted-foreground">{metric.label}</p>
          <p
            className={cn(
              "text-[11px] font-semibold",
              metric.tone === "primary"
                ? "text-primary"
                : metric.tone === "muted"
                  ? "text-muted-foreground"
                  : "text-foreground",
            )}
          >
            {metric.value}
          </p>
        </fieldset>
      ))}
    </div>
  );
}

export type {
  ResourceActionRegionProps,
  ResourceCardHeaderProps,
  ResourceCardShellProps,
  ResourceMetric,
  ResourceMetricsRowProps,
} from "./shared";
