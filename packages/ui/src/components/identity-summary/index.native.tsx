import { View } from "react-native";
import { Text } from "../text/index.native";
import type { IdentitySummaryProps } from "./shared";

function IdentitySummary({
  action,
  className,
  status,
  supporting,
  title,
  titleAs = "p",
  titleClassName,
  titleNumberOfLines = 2,
}: IdentitySummaryProps) {
  return (
    <View className={`min-w-0 flex-1 gap-1 ${className ?? ""}`}>
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className={`min-w-0 flex-1 font-medium text-foreground ${titleClassName ?? ""}`}
          accessibilityRole={titleAs === "p" ? undefined : "header"}
          numberOfLines={titleNumberOfLines}
        >
          {title}
        </Text>
        {action ? <View className="shrink-0">{action}</View> : null}
      </View>
      {supporting ? (
        <View>
          {typeof supporting === "string" ? (
            <Text className="text-sm text-muted-foreground">{supporting}</Text>
          ) : (
            supporting
          )}
        </View>
      ) : null}
      {status ? <View className="flex-row flex-wrap gap-2">{status}</View> : null}
    </View>
  );
}

export type { IdentitySummaryProps } from "./shared";
export { IdentitySummary };
