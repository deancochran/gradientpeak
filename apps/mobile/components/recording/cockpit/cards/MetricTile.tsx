import { Text } from "@repo/ui/components/text";
import React from "react";
import { View } from "react-native";

export function MetricTile({
  compact = false,
  layout = compact ? "compact" : "default",
  label,
  subtitle,
  tone = "neutral",
  value,
}: {
  compact?: boolean;
  layout?: "compact" | "default" | "half";
  label: string;
  subtitle?: string | null;
  tone?: "neutral" | "good" | "warn" | "danger";
  value: string;
}) {
  const valueClassName = getValueClassName(tone, compact || layout === "half");

  return (
    <View className={getContainerClassName(layout)}>
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className={valueClassName}>{value}</Text>
      {subtitle ? (
        <Text className="mt-0.5 text-[10px] font-medium text-muted-foreground" numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function getContainerClassName(layout: "compact" | "default" | "half") {
  if (layout === "compact") return "w-[31%] rounded-2xl bg-muted/70 px-3 py-1.5";
  if (layout === "half") return "w-[48%] rounded-[24px] bg-muted/70 px-4 py-3";
  return "min-w-[30%] flex-1 rounded-[28px] bg-muted/70 px-4 py-4";
}

function getValueClassName(tone: "neutral" | "good" | "warn" | "danger", compact: boolean) {
  const sizeClassName = compact ? "mt-0.5 text-base font-bold" : "mt-1 text-2xl font-black";

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
