import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { Label } from "@repo/ui/components/label";
import { Text } from "@repo/ui/components/text";
import { AlertCircle, CheckCircle, Info } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface WeeklyTargetsFormProps {
  data: {
    target_weekly_load_min: number;
    target_weekly_load_max: number;
    target_activities_per_week: number;
  };
  onChange: (updates: Partial<WeeklyTargetsFormProps["data"]>) => void;
  errors: Record<string, string>;
}

export function WeeklyTargetsForm({ data, onChange, errors }: WeeklyTargetsFormProps) {
  const COMMON_LOAD_MIN = 0;
  const COMMON_LOAD_MAX = 2000;

  // Calculate average Common Load per activity.
  const averageLoadPerActivity = React.useMemo(() => {
    const avgWeekly = (data.target_weekly_load_min + data.target_weekly_load_max) / 2;
    const activities = Math.max(1, data.target_activities_per_week);
    return Math.round(avgWeekly / activities);
  }, [data.target_weekly_load_min, data.target_weekly_load_max, data.target_activities_per_week]);

  // Validation states
  const loadRangeValid =
    !errors.load_min &&
    !errors.load_max &&
    data.target_weekly_load_max >= data.target_weekly_load_min;
  const activitiesValid = !errors.activities_per_week;

  const clampLoad = (value: number) => Math.min(COMMON_LOAD_MAX, Math.max(COMMON_LOAD_MIN, value));

  const handleMinLoadChange = (value: number) => {
    const nextMin = clampLoad(value);
    if (data.target_weekly_load_max < nextMin) {
      onChange({
        target_weekly_load_min: nextMin,
        target_weekly_load_max: nextMin,
      });
      return;
    }

    onChange({ target_weekly_load_min: nextMin });
  };

  const handleMaxLoadChange = (value: number) => {
    const nextMax = Math.max(clampLoad(value), data.target_weekly_load_min);
    onChange({ target_weekly_load_max: nextMax });
  };

  return (
    <View className="gap-6">
      {/* Header with description */}
      <View className="gap-2">
        <Text className="text-2xl font-bold">Weekly Training Targets</Text>
        <Text className="text-muted-foreground">
          Set your weekly Load range and activity frequency goals.
        </Text>
      </View>

      {/* Load Range */}
      <View className="gap-3">
        <Label className="text-base font-semibold">Weekly Load Range</Label>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <IntegerStepper
              id="weekly-target-min-common-load"
              label="Min Load"
              value={data.target_weekly_load_min}
              min={COMMON_LOAD_MIN}
              max={COMMON_LOAD_MAX}
              onChange={handleMinLoadChange}
              error={errors.load_min}
            />
          </View>
          <View className="flex-1">
            <IntegerStepper
              id="weekly-target-max-common-load"
              label="Max Load"
              value={data.target_weekly_load_max}
              min={COMMON_LOAD_MIN}
              max={COMMON_LOAD_MAX}
              onChange={handleMaxLoadChange}
              error={errors.load_max}
            />
          </View>
        </View>

        {/* Validation indicator */}
        {loadRangeValid && data.target_weekly_load_min > 0 && data.target_weekly_load_max > 0 && (
          <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md">
            <Icon as={CheckCircle} size={16} className="text-success" />
            <Text className="text-success text-sm">Valid Load range</Text>
          </View>
        )}
      </View>

      {/* Activities Per Week */}
      <View className="gap-3">
        <Label className="text-base font-semibold">Activities Per Week</Label>
        <IntegerStepper
          id="weekly-target-activities"
          value={data.target_activities_per_week}
          min={1}
          max={14}
          onChange={(nextActivities) => onChange({ target_activities_per_week: nextActivities })}
          helperText="Typical range is 3 to 6 sessions"
          error={errors.activities_per_week}
        />

        {/* Validation indicator */}
        {activitiesValid && data.target_activities_per_week > 0 && (
          <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md">
            <Icon as={CheckCircle} size={16} className="text-success" />
            <Text className="text-success text-sm">Valid activity count</Text>
          </View>
        )}
      </View>

      {/* Preview Card */}
      {data.target_weekly_load_min > 0 &&
        data.target_weekly_load_max > 0 &&
        data.target_activities_per_week > 0 && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 gap-3">
              <View className="flex-row items-center gap-2">
                <Icon as={Info} size={20} className="text-primary" />
                <Text className="font-semibold text-primary">Training Preview</Text>
              </View>

              <View className="gap-2">
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">Average Load per activity:</Text>
                  <Text className="font-semibold">{averageLoadPerActivity} Load</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">Weekly Load range:</Text>
                  <Text className="font-semibold">
                    {data.target_weekly_load_min} - {data.target_weekly_load_max} Load
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">Activities per week:</Text>
                  <Text className="font-semibold">{data.target_activities_per_week}</Text>
                </View>
              </View>
            </CardContent>
          </Card>
        )}

      {/* Tips Card */}
      <Card className="bg-muted/50">
        <CardContent className="p-4 gap-2">
          <Text className="font-semibold mb-1">💡 Tips</Text>
          <Text className="text-sm text-muted-foreground">
            • Start conservative with Load targets and build gradually
          </Text>
          <Text className="text-sm text-muted-foreground">
            • A typical recovery week is 50-80 Load per activity
          </Text>
          <Text className="text-sm text-muted-foreground">
            • Hard training sessions are typically 100-200 Load
          </Text>
          <Text className="text-sm text-muted-foreground">
            • Most athletes train 3-6 times per week
          </Text>
        </CardContent>
      </Card>

      {/* Warning for unrealistic values */}
      {averageLoadPerActivity > 300 && (
        <Alert icon={AlertCircle} variant="destructive">
          <AlertTitle>Warning: Very High Load</AlertTitle>
          <AlertDescription>
            Your average Load per activity ({averageLoadPerActivity}) is very high. This might be
            unrealistic for most athletes. Consider adjusting your targets.
          </AlertDescription>
        </Alert>
      )}
    </View>
  );
}
