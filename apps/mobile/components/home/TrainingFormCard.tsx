import { Progress } from "@repo/ui/components/progress";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";

interface FormStatus {
  label: string;
  percentage: number;
  color: string;
  explanation: string;
  ctl: number;
  atl: number;
  tsb: number;
}

interface TrainingFormCardProps {
  formStatus: FormStatus;
}

export function TrainingFormCard({ formStatus }: TrainingFormCardProps) {
  const getFormStatusColor = () => {
    switch (formStatus.color) {
      case "green":
        return "bg-green-500";
      case "blue":
        return "bg-blue-500";
      case "purple":
        return "bg-purple-500";
      case "orange":
        return "bg-orange-500";
      default:
        return "bg-muted";
    }
  };

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-foreground">Training Form</Text>
        <Text className={`${getFormStatusColor().replace("bg-", "text-")} text-sm font-semibold`}>
          {formStatus.label}
        </Text>
      </View>
      <Progress
        value={formStatus.percentage}
        className="h-3 w-full"
        indicatorClassName={getFormStatusColor()}
      />
      <Text className="text-sm text-card-foreground">{formStatus.explanation}</Text>
      <View className="flex-row justify-between">
        <View>
          <Text className="text-muted-foreground text-xs">Fitness (CTL)</Text>
          <Text className="text-foreground font-semibold">{formStatus.ctl}</Text>
        </View>
        <View>
          <Text className="text-muted-foreground text-xs">Fatigue (ATL)</Text>
          <Text className="text-foreground font-semibold">{formStatus.atl}</Text>
        </View>
        <View>
          <Text className="text-muted-foreground text-xs">Form (TSB)</Text>
          <Text className="text-foreground font-semibold">{formStatus.tsb}</Text>
        </View>
      </View>
    </View>
  );
}
