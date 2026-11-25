import { cn } from "../../lib/cn";
import { Button } from "../button/index.web";
import { Card, CardContent } from "../card/index.web";
import { type EmptyStateCardProps, emptyStateToneClassNames } from "./shared";

function EmptyStateCard({
  actionLabel,
  children,
  compact = false,
  description,
  icon: Icon,
  iconColor = "text-muted-foreground",
  iconSize = 48,
  onAction,
  title,
  testID,
  tone = "empty",
}: EmptyStateCardProps) {
  const isError = tone === "error" || tone === "unavailable";

  return (
    <Card
      aria-live={isError ? "assertive" : undefined}
      className={cn(emptyStateToneClassNames[tone], compact && "py-0")}
      data-testid={testID}
      {...(isError ? { role: "alert" } : {})}
    >
      <CardContent className={compact ? "py-6" : "py-12"}>
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          {Icon ? (
            <div className="flex items-center justify-center">
              <Icon className={cn(iconColor)} size={iconSize} strokeWidth={1.5} />
            </div>
          ) : null}

          <div className="flex min-w-0 max-w-md flex-col items-center gap-2">
            <p
              className={cn(
                "max-w-full [overflow-wrap:anywhere] font-semibold text-foreground",
                compact ? "text-base" : "text-lg",
              )}
            >
              {title}
            </p>
            {description ? (
              <p className="max-w-full [overflow-wrap:anywhere] text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {children}

          {actionLabel && onAction ? (
            <Button
              className="mt-2 h-auto max-w-full whitespace-normal [overflow-wrap:anywhere]"
              onClick={onAction}
              type="button"
              variant="outline"
            >
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export type { EmptyStateCardProps } from "./shared";
export { EmptyStateCard };
