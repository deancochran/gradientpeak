import { cn } from "../../lib/cn";
import type { IdentitySummaryProps } from "./shared";

function IdentitySummary({
  action,
  className,
  status,
  supporting,
  title,
  titleAs = "p",
  titleClassName,
}: IdentitySummaryProps) {
  const Title = titleAs;

  return (
    <div className={cn("flex min-w-0 items-start justify-between gap-3", className)}>
      <div className="min-w-0 flex-1 space-y-1">
        <Title className={cn("break-words font-medium text-foreground", titleClassName)}>
          {title}
        </Title>
        {supporting ? (
          <div className="break-words text-sm text-muted-foreground">{supporting}</div>
        ) : null}
        {status ? <div className="flex flex-wrap gap-2">{status}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export type { IdentitySummaryProps } from "./shared";
export { IdentitySummary };
