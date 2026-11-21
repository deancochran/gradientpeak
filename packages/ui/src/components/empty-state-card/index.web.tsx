import { cn } from "../../lib/cn";
import { Button } from "../button/index.web";
import { Card, CardContent } from "../card/index.web";
import type { EmptyStateCardProps } from "./shared";

function EmptyStateCard({
  actionLabel,
  description,
  icon: Icon,
  iconColor = "text-muted-foreground",
  iconSize = 48,
  onAction,
  title,
  tone = "empty",
}: EmptyStateCardProps) {
  const isError = tone === "error" || tone === "unavailable";
  const toneClassName =
    tone === "error"
      ? "border-destructive/50 bg-destructive/10"
      : tone === "denied"
        ? "border-warning/50 bg-warning/10"
        : tone === "unavailable"
          ? "border-warning/50 bg-card"
          : "border-border bg-card";

  return (
    <Card
      aria-live={isError ? "assertive" : undefined}
      className={toneClassName}
      {...(isError ? { role: "alert" } : {})}
    >
      <CardContent className="py-12">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          {Icon ? (
            <div className="flex items-center justify-center">
              <Icon className={cn(iconColor)} size={iconSize} strokeWidth={1.5} />
            </div>
          ) : null}

          <div className="flex min-w-0 max-w-md flex-col items-center gap-2">
            <p className="max-w-full [overflow-wrap:anywhere] text-lg font-semibold text-foreground">
              {title}
            </p>
            <p className="max-w-full [overflow-wrap:anywhere] text-sm text-muted-foreground">
              {description}
            </p>
          </div>

          {actionLabel && onAction ? (
            <Button
              className="mt-2 h-auto max-w-full whitespace-normal [overflow-wrap:anywhere]"
              onClick={onAction}
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
