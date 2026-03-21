import { Card, CardContent } from "../card/index.web";
import { Icon } from "../icon/index.web";
import type { MetricCardProps } from "./shared";

const variantColors = {
  default: "text-foreground",
  success: "text-green-600",
  warning: "text-yellow-600",
  danger: "text-red-600",
} as const;

function MetricCard({
  color,
  comparisonLabel,
  comparisonValue,
  icon,
  label,
  subtitle,
  unit,
  value,
  variant = "default",
}: MetricCardProps) {
  const valueClassName = color ?? variantColors[variant];

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        {(icon || label) && (
          <div className="mb-2 flex flex-row items-center gap-2">
            {icon ? (
              <Icon as={icon} className={color ?? "text-muted-foreground"} size={16} />
            ) : null}
            <p className="text-xs uppercase text-muted-foreground">{label}</p>
          </div>
        )}

        <div className="flex flex-row items-baseline gap-1">
          <p className={`text-2xl font-bold ${valueClassName}`}>{value}</p>
          {unit ? <p className="text-sm text-muted-foreground">{unit}</p> : null}
        </div>

        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}

        {comparisonValue != null ? (
          <div className="mt-2 flex flex-row items-center gap-1">
            <p className="text-xs text-muted-foreground">{comparisonLabel || "vs plan"}:</p>
            <p className="text-xs font-medium">{comparisonValue}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export type { MetricCardProps } from "./shared";
export { MetricCard };
