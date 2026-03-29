import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { Label } from "@repo/ui/components/label";
import { Text } from "@repo/ui/components/text";
import { AlertCircle, Calendar, CheckCircle } from "lucide-react-native";
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
  // Calculate training days available
  const trainingDaysAvailable = 7 - data.min_rest_days_per_week;
  const scheduleValid =
    trainingDaysAvailable >= data.target_activities_per_week &&
    !errors.schedule &&
    !errors.max_consecutive_days &&
    !errors.min_rest_days;

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
        <IntegerStepper
          id="recovery-max-consecutive-days"
          value={data.max_consecutive_days}
          min={1}
          max={7}
          onChange={(nextValue) => onChange({ max_consecutive_days: nextValue })}
          helperText="Set max streak before a required rest day"
          error={errors.max_consecutive_days}
        />

        {!errors.max_consecutive_days && data.max_consecutive_days > 0 && (
          <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md">
            <Icon as={CheckCircle} size={16} className="text-success" />
            <Text className="text-success text-sm">
              Rest required after {data.max_consecutive_days} training days
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
        <IntegerStepper
          id="recovery-min-rest-days"
          value={data.min_rest_days_per_week}
          min={0}
          max={7}
          onChange={(nextValue) => onChange({ min_rest_days_per_week: nextValue })}
          helperText="Set guaranteed complete rest days each week"
          error={errors.min_rest_days}
        />

        {!errors.min_rest_days && data.min_rest_days_per_week >= 0 && (
          <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md">
            <Icon as={CheckCircle} size={16} className="text-success" />
            <Text className="text-success text-sm">
              {data.min_rest_days_per_week} rest day
              {data.min_rest_days_per_week !== 1 ? "s" : ""} per week
            </Text>
          </View>
        )}
      </View>

      {/* Schedule Preview */}
      {data.min_rest_days_per_week >= 0 && data.min_rest_days_per_week <= 7 && (
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
                <Text className="font-semibold">{data.min_rest_days_per_week} days</Text>
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
      {data.min_rest_days_per_week < 1 && data.max_consecutive_days > 5 && (
        <Alert icon={AlertCircle} iconClassName="text-amber-500">
          <AlertTitle className="text-amber-500">Warning: High Risk of Overtraining</AlertTitle>
          <AlertDescription className="text-amber-500">
            Your current settings allow very little rest. This significantly increases injury risk
            and may lead to burnout. Consider adding more rest days.
          </AlertDescription>
        </Alert>
      )}

      {/* Warning for too much rest */}
      {data.min_rest_days_per_week > 4 && (
        <Card className="bg-amber-500/10 border-amber-500">
          <CardContent className="p-4 flex-row items-start gap-2">
            <Icon as={AlertCircle} size={20} className="text-amber-500 mt-0.5" />
            <View className="flex-1">
              <Text className="text-amber-500 font-semibold mb-1">Note: Limited Training Days</Text>
              <Text className="text-amber-500 text-sm">
                With {data.min_rest_days_per_week} rest days, you only have {trainingDaysAvailable}{" "}
                training days per week. This may limit your ability to build fitness effectively.
              </Text>
            </View>
          </CardContent>
        </Card>
      )}
    </View>
  );
}
