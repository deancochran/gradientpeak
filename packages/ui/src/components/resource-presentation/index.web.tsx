import { cn } from "../../lib/cn";
import { Card, CardContent } from "../card/index.web";
import { Icon } from "../icon/index.web";
import { Label } from "../label/index.web";
import type {
  ResourceActionRegionProps,
  ResourceAssociationProps,
  ResourceCardHeaderProps,
  ResourceCardShellProps,
  ResourceMetricsRowProps,
  ResourceSelectionFieldProps,
} from "./shared";

export function ResourceActionRegion({ children, className, testID }: ResourceActionRegionProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} data-testid={testID}>
      {children}
    </div>
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
    <section className="space-y-2" data-testid={testID}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ResourceSelectionField<T extends string>({
  automaticLabel,
  disabled = false,
  fallbackLabel,
  id,
  label,
  onChange,
  options,
  unavailableMessage = "Selected resource is outside the current results. Its selection is retained.",
  value,
}: ResourceSelectionFieldProps<T>) {
  const isCurrentResult = value === null || options.some((option) => option.value === value);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        className="h-10 w-full rounded-md border bg-background px-3"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange((event.target.value || null) as T | null)}
        value={value ?? ""}
      >
        <option value="">{automaticLabel}</option>
        {value !== null && !isCurrentResult ? (
          <option value={value}>{fallbackLabel ?? "Selected resource"}</option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {value !== null && !isCurrentResult ? (
        <p className="text-xs text-muted-foreground" role="status">
          {unavailableMessage}
        </p>
      ) : null}
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
          <ResourceActionRegion {...(testID ? { testID: `${testID}-action-region` } : {})}>
            {actionRegion}
          </ResourceActionRegion>
        ) : null}
        {onPress ? (
          <button
            aria-label={accessibilityLabel}
            aria-pressed={accessibilityState?.selected}
            className={cn(
              "w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              navigationClassName,
            )}
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
  const Title = detail ? "h2" : "h3";
  const titleLines = titleNumberOfLines ?? (detail ? undefined : 2);
  const descriptionLines = descriptionNumberOfLines ?? (detail ? undefined : 2);
  const lineClampStyle = (lines: number | undefined) =>
    lines === undefined
      ? undefined
      : {
          WebkitBoxOrient: "vertical" as const,
          WebkitLineClamp: lines,
          display: "-webkit-box",
          overflow: "hidden",
        };

  return (
    <div className="flex items-start gap-3">
      {leading ??
        (icon ? (
          <div className={cn("rounded-full p-2.5", iconContainerClassName)}>
            <Icon as={icon} className={iconClassName} size={compact ? 16 : 18} />
          </div>
        ) : null)}
      <div className="min-w-0 flex-1 space-y-1">
        {(titleContent ?? resolvedTitle) ? (
          <Title
            className={cn(
              detail ? "text-xl" : compact ? "text-lg" : "text-xl",
              "font-semibold text-foreground",
              titleClassName,
            )}
            style={lineClampStyle(titleLines)}
          >
            {titleContent ?? resolvedTitle}
          </Title>
        ) : null}
        {resolvedDescription ? (
          <p
            className="text-sm leading-5 text-muted-foreground"
            style={lineClampStyle(descriptionLines)}
          >
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
  const visibleMetrics = metrics.slice(0, maxItems ?? metrics.length);
  if (visibleMetrics.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-start gap-y-2 px-1", compact ? "gap-x-4" : "gap-x-5")}
      data-testid={testID}
    >
      {visibleMetrics.map((metric) => (
        <fieldset
          aria-label={metric.accessibilityLabel ?? `${metric.label}, ${metric.value}`}
          className="m-0 min-w-0 border-0 p-0"
          key={metric.label}
        >
          <p className="text-[10px] text-muted-foreground">{metric.label}</p>
          <p
            className={cn(
              "text-sm font-semibold",
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
  ResourceAssociationProps,
  ResourceCardHeaderProps,
  ResourceCardShellProps,
  ResourceMetric,
  ResourceMetricsRowProps,
  ResourceSelectionFieldProps,
  ResourceSelectionOption,
} from "./shared";
