import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { AlertCircle, CheckCircle, Calendar } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface RecoveryRulesFormProps {
  data: {
    max_consecutive_days: number;
    min_rest_days_per_week: number;
    target_activities_per_week: number; // For validation
  };
  onChange: (updates: Partial<RecoveryRulesFormProps["data"]>) => void;
  errors: Record<string, string>;
}

export function RecoveryRulesForm({ data, onChange, errors }: RecoveryRulesFormProps) {
  const [maxConsecutiveText, setMaxConsecutiveText] = React.useState(
    data.max_consecutive_days.toString()
  );
  const [minRestDaysText, setMinRestDaysText] = React.useState(
    data.min_rest_days_per_week.toString()
  );

  // Calculate training days available
  const trainingDaysAvailable = 7 - parseInt(minRestDaysText || "0");
  const scheduleValid =
    trainingDaysAvailable >= data.target_activities_per_week &&
    !errors.schedule &&
    !errors.max_consecutive_days &&
    !errors.min_rest_days;

  const handleMaxConsecutiveChange = (text: string) => {
    setMaxConsecutiveText(text);
    const value = parseInt(text);
    if (!isNaN(value)) {
      onChange({ max_consecutive_days: value });
    }
  };

  const handleMinRestDaysChange = (text: string) => {
    setMinRestDaysText(text);
    const value = parseInt(text);
    if (!isNaN(value)) {
      onChange({ min_rest_days_per_week: value });
    }
  };

  return (
    <View className="gap-6">
      {/* Header */}
      <View className="gap-2">
        <Text className="text-2xl font-bold">Recovery Rules</Text>
        <Text className="text-muted-foreground">
          Set guidelines for rest and recovery to prevent overtraining and maintain consistency.
        </Text>
      </View>

      {/* Max Consecutive Training Days */}
      <View className="gap-3">
        <Label className="text-base font-semibold">Max Consecutive Training Days</Label>
        <Text className="text-sm text-muted-foreground">
          Maximum number of days you can train in a row before requiring a rest day
        </Text>
        <Input
          value={maxConsecutiveText}
          onChangeText={handleMaxConsecutiveChange}
          keyboardType="numeric"
          placeholder="3"
          className={errors.max_consecutive_days ? "border-destructive" : ""}
        />
        {errors.max_consecutive_days && (
          <Text className="text-destructive text-xs">{errors.max_consecutive_days}</Text>
        )}

        {!errors.max_consecutive_days && parseInt(maxConsecutiveText) > 0 && (
          <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md">
            <Icon as={CheckCircle} size={16} className="text-success" />
            <Text className="text-success text-sm">
              Rest required after {maxConsecutiveText} training days
            </Text>
          </View>
        )}
      </View>

      {/* Min Rest Days Per Week */}
      <View className="gap-3">
        <Label className="text-base font-semibold">Min Rest Days Per Week</Label>
        <Text className="text-sm text-muted-foreground">
          Minimum number of complete rest days each week
        </Text>
        <Input
          value={minRestDaysText}
          onChangeText={handleMinRestDaysChange}
          keyboardType="numeric"
          placeholder="2"
          className={errors.min_rest_days ? "border-destructive" : ""}
        />
        {errors.min_rest_days && (
          <Text className="text-destructive text-xs">{errors.min_rest_days}</Text>
        )}

        {!errors.min_rest_days && parseInt(minRestDaysText) >= 0 && (
          <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md">
            <Icon as={CheckCircle} size={16} className="text-success" />
            <Text className="text-success text-sm">
              {minRestDaysText} rest day{parseInt(minRestDaysText) !== 1 ? "s" : ""} per week
            </Text>
          </View>
        )}
      </View>

      {/* Schedule Preview */}
      {parseInt(minRestDaysText) >= 0 && parseInt(minRestDaysText) <= 7 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 gap-3">
            <View className="flex-row items-center gap-2">
              <Icon as={Calendar} size={20} className="text-primary" />
              <Text className="font-semibold text-primary">Weekly Schedule Preview</Text>
            </View>

            <View className="gap-2">
              <View className="flex-row justify-between">
                <Text className="text-muted-foreground">Training days available:</Text>
                <Text className="font-semibold">{trainingDaysAvailable} days</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-muted-foreground">Activities planned:</Text>
                <Text className="font-semibold">{data.target_activities_per_week} activities</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-muted-foreground">Rest days guaranteed:</Text>
                <Text className="font-semibold">{minRestDaysText} days</Text>
              </View>
            </View>

            {/* Schedule validation */}
            {scheduleValid ? (
              <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md mt-2">
                <Icon as={CheckCircle} size={16} className="text-success" />
                <Text className="text-success text-sm font-medium">
                  Schedule is valid and achievable
                </Text>
              </View>
            ) : (
              trainingDaysAvailable < data.target_activities_per_week && (
                <View className="flex-row items-center gap-2 bg-destructive/10 p-2 rounded-md mt-2">
                  <Icon as={AlertCircle} size={16} className="text-destructive" />
                  <Text className="text-destructive text-sm font-medium">
                    Not enough training days for planned activities
                  </Text>
                </View>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Tips Card */}
      <Card className="bg-muted/50">
        <CardContent className="p-4 gap-2">
          <Text className="font-semibold mb-1">💡 Recovery Tips</Text>
          <Text className="text-sm text-muted-foreground">
            • Most athletes benefit from 1-2 complete rest days per week
          </Text>
          <Text className="text-sm text-muted-foreground">
            • Training 3-4 consecutive days is common for serious athletes
          </Text>
          <Text className="text-sm text-muted-foreground">
            • Beginners should limit to 2-3 consecutive training days
          </Text>
          <Text className="text-sm text-muted-foreground">
            • Rest days are when your body adapts and gets stronger
          </Text>
        </CardContent>
      </Card>

      {/* Warning for insufficient rest */}
      {parseInt(minRestDaysText) < 1 && parseInt(maxConsecutiveText) > 5 && (
        <Card className="bg-amber-500/10 border-amber-500">
          <CardContent className="p-4 flex-row items-start gap-2">
            <Icon as={AlertCircle} size={20} className="text-amber-500 mt-0.5" />
            <View className="flex-1">
              <Text className="text-amber-500 font-semibold mb-1">
                Warning: High Risk of Overtraining
              </Text>
              <Text className="text-amber-500 text-sm">
                Your current settings allow very little rest. This significantly increases injury
                risk and may lead to burnout. Consider adding more rest days.
              </Text>
            </View>
          </CardContent>
        </Card>
      )}

      {/* Warning for too much rest */}
      {parseInt(minRestDaysText) > 4 && (
        <Card className="bg-amber-500/10 border-amber-500">
          <CardContent className="p-4 flex-row items-start gap-2">
            <Icon as={AlertCircle} size={20} className="text-amber-500 mt-0.5" />
            <View className="flex-1">
              <Text className="text-amber-500 font-semibold mb-1">
                Note: Limited Training Days
              </Text>
              <Text className="text-amber-500 text-sm">
                With {minRestDaysText} rest days, you only have {trainingDaysAvailable} training
                days per week. This may limit your ability to build fitness effectively.
              </Text>
            </View>
          </CardContent>
        </Card>
      )}
    </View>
  );
}
