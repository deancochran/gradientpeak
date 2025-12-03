import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
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
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <View className="flex-row items-center justify-between">
          <CardTitle className="text-foreground">Training Form</CardTitle>
          <View className={`px-3 py-1 rounded-full ${getFormStatusColor()}/20`}>
            <Text
              className={`${getFormStatusColor().replace("bg-", "text-")} font-semibold text-sm`}
            >
              {formStatus.label}
            </Text>
          </View>
        </View>
      </CardHeader>
      <CardContent>
        <Progress
          value={formStatus.percentage}
          className="w-full h-3 mb-3"
          indicatorClassName={getFormStatusColor()}
        />
        <Text className="text-card-foreground text-sm mb-3">
          {formStatus.explanation}
        </Text>
        <View className="flex-row justify-between">
          <View>
            <Text className="text-muted-foreground text-xs">Fitness (CTL)</Text>
            <Text className="text-foreground font-semibold">
              {formStatus.ctl}
            </Text>
          </View>
          <View>
            <Text className="text-muted-foreground text-xs">Fatigue (ATL)</Text>
            <Text className="text-foreground font-semibold">
              {formStatus.atl}
            </Text>
          </View>
          <View>
            <Text className="text-muted-foreground text-xs">Form (TSB)</Text>
            <Text className="text-foreground font-semibold">
              {formStatus.tsb}
            </Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}
