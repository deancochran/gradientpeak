import { cn } from "@repo/ui/lib/cn";

export type CanonicalMetricItem = {
  accessibilityLabel?: string;
  key: string;
  label: string;
  tone?: "primary";
  value: string;
};

export function CanonicalMetricsRow({
  items,
  testID,
}: {
  items: readonly CanonicalMetricItem[];
  testID?: string;
}) {
  return (
    <div
      className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4"
      data-testid={testID}
    >
      {items.slice(0, 4).map((item) => (
        <section
          aria-label={item.accessibilityLabel}
          className={cn(
            "rounded-xl border border-border bg-muted/20 px-3 py-2",
            item.tone === "primary" && "border-primary/30 bg-primary/5",
          )}
          key={item.key}
        >
          <p
            className={cn(
              "text-xs uppercase tracking-wide",
              item.tone === "primary" && "text-primary",
            )}
          >
            {item.label}
          </p>
          <p
            className={cn(
              "mt-1 font-medium text-foreground",
              item.tone === "primary" && "text-primary",
            )}
          >
            {item.value}
          </p>
        </section>
      ))}
    </div>
  );
}
