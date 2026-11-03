import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { useTheme } from "@/lib/stores/theme-store";
import { getPlanChartTheme } from "../training-path/planChartTheme";
import type { PlanningLedgerPresentation } from "./planningLedgerPresentation";

export function IntensityDistributionChart({
  intensity,
}: {
  intensity: PlanningLedgerPresentation["intensity"];
}) {
  const { resolvedTheme } = useTheme();
  const colors = getPlanChartTheme(resolvedTheme).intensity;

  return (
    <View className="gap-3" testID="planning-ledger-intensity-distribution">
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          Intensity distribution
        </Text>
        <Text className="text-xs text-muted-foreground">
          Time at intensity · {intensity.durationLabel}
        </Text>
      </View>
      {intensity.bands.length ? (
        <>
          <View
            accessible
            accessibilityLabel={intensity.summary}
            accessibilityRole="image"
            className="h-4 flex-row overflow-hidden rounded-full bg-muted"
          >
            {intensity.bands.map((band) => (
              <View
                key={band.band}
                style={{ backgroundColor: colors[band.band], flexGrow: band.percentage }}
              />
            ))}
          </View>
          <View className="flex-row flex-wrap gap-x-4 gap-y-2">
            {intensity.bands.map((band) => (
              <View className="min-w-[42%] flex-row items-center gap-2" key={band.band}>
                <View
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colors[band.band] }}
                />
                <Text className="text-xs text-muted-foreground">
                  {band.label} {band.percentageLabel} · {band.durationLabel}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          Intensity distribution is unavailable for this period.
        </Text>
      )}
    </View>
  );
}
