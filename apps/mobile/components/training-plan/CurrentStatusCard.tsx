import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Activity, Heart, TrendingUp } from "lucide-react-native";
import { View } from "react-native";

interface CurrentStatusCardProps {
  ctl: number;
  atl: number;
  tsb: number;
  form: "fresh" | "optimal" | "neutral" | "tired" | "overreaching";
}

const formConfig = {
  fresh: {
    label: "Fresh",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    description: "Well rested, ready for hard training",
  },
  optimal: {
    label: "Optimal",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    description: "Good balance of fitness and freshness",
  },
  neutral: {
    label: "Neutral",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    description: "Moderate training stress",
  },
  tired: {
    label: "Tired",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    description: "Accumulated fatigue, consider recovery",
  },
  overreaching: {
    label: "Overreaching",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    description: "High fatigue, recovery needed",
  },
};

export function CurrentStatusCard({ ctl, atl, tsb, form }: CurrentStatusCardProps) {
  const formInfo = formConfig[form];

  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-4">
      <Text className="text-base font-semibold text-foreground">Current Training Status</Text>

      <View className={`${formInfo.bgColor} rounded-lg p-4`}>
        <View className="mb-2 flex-row items-center justify-between">
          <Text className={`text-lg font-bold ${formInfo.color}`}>{formInfo.label}</Text>
          <Text className={`text-2xl font-bold ${formInfo.color}`}>
            TSB: {tsb > 0 ? "+" : ""}
            {tsb}
          </Text>
        </View>
        <Text className="text-sm text-muted-foreground">{formInfo.description}</Text>
      </View>

      <View className="flex-row gap-3">
        <TrainingMetricCard
          icon={TrendingUp}
          iconClassName="text-blue-500"
          label="CTL"
          subtitle="Fitness"
          value={`${ctl}`}
        />
        <TrainingMetricCard
          icon={Heart}
          iconClassName="text-red-500"
          label="ATL"
          subtitle="Fatigue"
          value={`${atl}`}
        />
        <TrainingMetricCard
          icon={Activity}
          iconClassName={formInfo.color}
          label="TSB"
          subtitle="Form"
          value={`${tsb > 0 ? "+" : ""}${tsb}`}
          valueClassName={formInfo.color}
        />
      </View>

      <Text className="text-xs leading-5 text-muted-foreground">
        <Text className="font-semibold">CTL</Text> (Chronic Training Load) represents your long-term
        fitness. <Text className="font-semibold">ATL</Text> (Acute Training Load) represents recent
        fatigue. <Text className="font-semibold">TSB</Text> (Training Stress Balance) is the
        difference, indicating your current form.
      </Text>
    </View>
  );
}

function TrainingMetricCard({
  icon,
  iconClassName,
  label,
  subtitle,
  value,
  valueClassName,
}: {
  icon: any;
  iconClassName: string;
  label: string;
  subtitle: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <View className="flex-1 rounded-lg bg-muted/30 p-4">
      <View className="mb-2 flex-row items-center gap-2">
        <Icon as={icon} size={18} className={iconClassName} />
        <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
      </View>
      <Text className={`mb-1 text-2xl font-bold ${valueClassName ?? "text-foreground"}`}>
        {value}
      </Text>
      <Text className="text-xs text-muted-foreground">{subtitle}</Text>
    </View>
  );
}
