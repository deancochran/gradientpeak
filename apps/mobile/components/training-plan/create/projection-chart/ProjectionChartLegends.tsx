import { Text } from "@repo/ui/components/text";
import { Pressable, ScrollView, View } from "react-native";

export type ProjectionChartLineConfig<YKey extends string> = Array<{
  key: YKey;
  label: string;
  color: string;
}>;

interface ProjectionChartLegendsProps<YKey extends string> {
  lineConfig: ProjectionChartLineConfig<YKey>;
  lineVisibility: Record<YKey, boolean>;
  activeLineCount: number;
  phaseLegendItems: Array<{ label: string; color: string }>;
  onToggleLineVisibility: (key: YKey) => void;
}

export function ProjectionChartLegends<YKey extends string>({
  lineConfig,
  lineVisibility,
  activeLineCount,
  phaseLegendItems,
  onToggleLineVisibility,
}: ProjectionChartLegendsProps<YKey>) {
  return (
    <View className="gap-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center", gap: 6 }}
      >
        {lineConfig.map((line) => {
          const isActive = lineVisibility[line.key];
          const isOnlyVisibleLine = isActive && activeLineCount === 1;
          return (
            <Pressable
              key={line.key}
              onPress={() => onToggleLineVisibility(line.key)}
              disabled={isOnlyVisibleLine}
              accessibilityRole="button"
              accessibilityState={{
                selected: isActive,
                disabled: isOnlyVisibleLine,
              }}
              accessibilityLabel={`${line.label} line`}
              accessibilityHint={
                isOnlyVisibleLine
                  ? "At least one chart line must remain visible"
                  : `${isActive ? "Hide" : "Show"} this series`
              }
              hitSlop={8}
              className={`flex-row items-center gap-1 rounded-full border px-1.5 py-0.5 ${isActive ? "border-border bg-muted/40" : "border-border/70 bg-background/70"}`}
            >
              <View
                className="h-0.5 w-3 rounded-full"
                style={{
                  backgroundColor: line.color,
                  opacity: isActive ? 1 : 0.35,
                }}
              />
              <Text
                className={`text-[9px] ${isActive ? "text-foreground" : "text-muted-foreground"}`}
              >
                {line.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {phaseLegendItems.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: "center", gap: 8 }}
        >
          <Text className="text-[9px] text-muted-foreground">Phase colors:</Text>
          {phaseLegendItems.map((phase) => (
            <View key={`phase-legend-${phase.label}`} className="flex-row items-center gap-1">
              <View className="h-1 w-3 rounded-full" style={{ backgroundColor: phase.color }} />
              <Text className="text-[9px] text-muted-foreground">{phase.label}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
