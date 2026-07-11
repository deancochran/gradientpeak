import { Text } from "@repo/ui/components/text";
import { TouchableOpacity, View } from "react-native";

interface TrainingReadinessCardProps {
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  form: "fresh" | "optimal" | "neutral" | "tired" | "overreaching";
  onPress?: () => void;
}

export function TrainingReadinessCard({ ctl, atl, tsb, onPress }: TrainingReadinessCardProps) {
  const CardWrapper = onPress ? TouchableOpacity : View;

  return (
    <CardWrapper onPress={onPress} activeOpacity={0.7}>
      <View className="gap-3 rounded-xl border border-border bg-card px-4 py-4">
        <View className="flex-row items-center justify-between">
          <ReadinessMetric
            code="CTL"
            label="Long-term load"
            value={ctl === null ? "—" : `${ctl}`}
          />
          <View className="h-12 w-px bg-border" />
          <ReadinessMetric code="ATL" label="Recent load" value={atl === null ? "—" : `${atl}`} />
          <View className="h-12 w-px bg-border" />
          <ReadinessMetric
            code="TSB"
            label="Load balance"
            value={tsb === null ? "—" : `${tsb > 0 ? "+" : ""}${tsb}`}
          />
        </View>

        <Text className="border-t border-border pt-2 text-center text-xs text-muted-foreground">
          Modeled training loads · not a physiological readiness measure
        </Text>
      </View>
    </CardWrapper>
  );
}

function ReadinessMetric({ code, label, value }: { code: string; label: string; value: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-2xl font-semibold text-foreground">{value}</Text>
      <Text className="mt-0.5 text-xs text-muted-foreground">{label}</Text>
      <Text className="text-[10px] text-muted-foreground">{code}</Text>
    </View>
  );
}
