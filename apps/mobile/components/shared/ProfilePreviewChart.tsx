import {
  type ProfileChartInputPoint,
  projectProfileChartPoints,
  serializeProfileChartPoints,
} from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";

export function ProfilePreviewChart({
  accessibilityLabel,
  label,
  samples,
  summary,
  testID,
}: {
  accessibilityLabel: string;
  label: string;
  samples: readonly ProfileChartInputPoint[];
  summary: string;
  testID: string;
}) {
  const projected = projectProfileChartPoints(samples);
  const points = serializeProfileChartPoints(projected);
  if (!points) return null;
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      className="gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-2"
      testID={testID}
    >
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <Text className="text-xs text-muted-foreground">{summary}</Text>
      <Svg
        accessible={false}
        className="h-16 w-full text-primary"
        height={64}
        preserveAspectRatio="none"
        viewBox="0 0 100 48"
        width="100%"
      >
        <Polyline
          fill="none"
          points={points}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
        />
        {projected.length === 1 && projected[0] ? (
          <Circle cx={projected[0].x} cy={projected[0].y} fill="currentColor" r={2.5} />
        ) : null}
      </Svg>
    </View>
  );
}
