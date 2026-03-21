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
}: EmptyStateCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="py-12">
        <div className="flex items-center justify-center gap-4">
          {Icon ? (
            <div className="flex items-center justify-center">
              <Icon className={cn(iconColor)} size={iconSize} strokeWidth={1.5} />
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <p className="text-center text-lg font-semibold text-foreground">{title}</p>
            <p className="max-w-[280px] text-center text-sm text-muted-foreground">{description}</p>
          </div>

          {actionLabel && onAction ? (
            <Button className="mt-2" onClick={onAction} variant="outline">
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
