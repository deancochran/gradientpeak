import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
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

export function CurrentStatusCard({
  ctl,
  atl,
  tsb,
  form,
}: CurrentStatusCardProps) {
  const formInfo = formConfig[form];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Training Status</CardTitle>
      </CardHeader>
      <CardContent>
        <View className="gap-4">
          {/* Form Status Banner */}
          <View className={`${formInfo.bgColor} rounded-lg p-4`}>
            <View className="flex-row items-center justify-between mb-2">
              <Text className={`text-lg font-bold ${formInfo.color}`}>
                {formInfo.label}
              </Text>
              <Text className={`text-2xl font-bold ${formInfo.color}`}>
                TSB: {tsb > 0 ? "+" : ""}
                {tsb}
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground">
              {formInfo.description}
            </Text>
          </View>

          {/* Metrics Grid */}
          <View className="flex-row gap-3">
            {/* CTL - Fitness */}
            <View className="flex-1 bg-muted/30 rounded-lg p-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Icon as={TrendingUp} size={18} className="text-blue-500" />
                <Text className="text-xs text-muted-foreground font-medium">
                  CTL
                </Text>
              </View>
              <Text className="text-2xl font-bold mb-1">{ctl}</Text>
              <Text className="text-xs text-muted-foreground">
                Fitness
              </Text>
            </View>

            {/* ATL - Fatigue */}
            <View className="flex-1 bg-muted/30 rounded-lg p-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Icon as={Heart} size={18} className="text-red-500" />
                <Text className="text-xs text-muted-foreground font-medium">
                  ATL
                </Text>
              </View>
              <Text className="text-2xl font-bold mb-1">{atl}</Text>
              <Text className="text-xs text-muted-foreground">
                Fatigue
              </Text>
            </View>

            {/* TSB - Form */}
            <View className="flex-1 bg-muted/30 rounded-lg p-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Icon as={Activity} size={18} className={formInfo.color} />
                <Text className="text-xs text-muted-foreground font-medium">
                  TSB
                </Text>
              </View>
              <Text className={`text-2xl font-bold mb-1 ${formInfo.color}`}>
                {tsb > 0 ? "+" : ""}
                {tsb}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Form
              </Text>
            </View>
          </View>

          {/* Info Text */}
          <View className="bg-muted/20 rounded-lg p-3">
            <Text className="text-xs text-muted-foreground leading-5">
              <Text className="font-semibold">CTL</Text> (Chronic Training Load) represents your long-term fitness.{" "}
              <Text className="font-semibold">ATL</Text> (Acute Training Load) represents recent fatigue.{" "}
              <Text className="font-semibold">TSB</Text> (Training Stress Balance) is the difference, indicating your current form.
            </Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}
