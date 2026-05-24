import { Text } from "@repo/ui/components/text";
import { View } from "react-native";

export function MetricTile({
  compact = false,
  layout = compact ? "compact" : "default",
  label,
  subtitle,
  target,
  tone = "neutral",
  unit,
  value,
}: {
  compact?: boolean;
  layout?: "compact" | "default" | "half" | "target";
  label: string;
  subtitle?: string | null;
  target?: string | null;
  tone?: "neutral" | "good" | "warn" | "danger";
  unit?: string | null;
  value: string;
}) {
  const valueClassName = getValueClassName(tone, layout);
  const unitClassName = getUnitClassName(layout);
  const supportingText = target ? `Target ${target}` : subtitle;

  return (
    <View className={getContainerClassName(layout)}>
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <View className="mt-0.5 flex-row items-baseline gap-1">
        <Text className={valueClassName}>{value}</Text>
        {unit ? (
          <Text className={`${unitClassName} font-semibold text-muted-foreground`}>{unit}</Text>
        ) : null}
      </View>
      {supportingText ? (
        <Text className="mt-0.5 text-[10px] font-medium text-muted-foreground" numberOfLines={1}>
          {supportingText}
        </Text>
      ) : null}
    </View>
  );
}

function getContainerClassName(layout: "compact" | "default" | "half" | "target") {
  if (layout === "compact") {
    return "min-h-14 w-[31%] justify-between rounded-2xl bg-muted/70 px-2.5 py-1.5";
  }
  if (layout === "half") {
    return "min-h-28 w-[48%] justify-between self-stretch rounded-[24px] bg-muted/70 px-4 py-4";
  }
  if (layout === "target") {
    return "min-h-24 w-32 justify-between rounded-[24px] bg-background px-4 py-3";
  }
  return "min-h-28 min-w-[30%] flex-1 justify-between self-stretch rounded-[28px] bg-muted/70 px-4 py-4";
}

function getValueClassName(
  tone: "neutral" | "good" | "warn" | "danger",
  layout: "compact" | "default" | "half" | "target",
) {
  const sizeClassName = getValueSizeClassName(layout);

  switch (tone) {
    case "good":
      return `${sizeClassName} text-emerald-600`;
    case "warn":
      return `${sizeClassName} text-amber-600`;
    case "danger":
      return `${sizeClassName} text-red-600`;
    default:
      return `${sizeClassName} text-foreground`;
  }
}

function getValueSizeClassName(layout: "compact" | "default" | "half" | "target") {
  if (layout === "compact") return "text-lg font-black leading-tight";
  if (layout === "target") return "text-2xl font-black leading-tight";
  if (layout === "half") return "text-5xl font-black leading-none";
  return "text-4xl font-black leading-tight";
}

function getUnitClassName(layout: "compact" | "default" | "half" | "target") {
  if (layout === "compact") return "text-xs";
  if (layout === "target") return "text-xs";
  if (layout === "half") return "text-base";
  return "text-sm";
}
