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
    target_weekly_tss_min: number;
    target_weekly_tss_max: number;
    target_activities_per_week: number;
  };
  onChange: (updates: Partial<WeeklyTargetsFormProps["data"]>) => void;
  errors: Record<string, string>;
}

export function WeeklyTargetsForm({ data, onChange, errors }: WeeklyTargetsFormProps) {
  const TSS_MIN = 0;
  const TSS_MAX = 2000;

  // Calculate average TSS per activity
  const avgTssPerActivity = React.useMemo(() => {
    const avgWeekly = (data.target_weekly_tss_min + data.target_weekly_tss_max) / 2;
    const activities = Math.max(1, data.target_activities_per_week);
    return Math.round(avgWeekly / activities);
  }, [data.target_weekly_tss_min, data.target_weekly_tss_max, data.target_activities_per_week]);

  // Validation states
  const tssRangeValid =
    !errors.tss_min && !errors.tss_max && data.target_weekly_tss_max >= data.target_weekly_tss_min;
  const activitiesValid = !errors.activities_per_week;

  const clampTss = (value: number) => Math.min(TSS_MAX, Math.max(TSS_MIN, value));

  const handleMinTssChange = (value: number) => {
    const nextMin = clampTss(value);
    if (data.target_weekly_tss_max < nextMin) {
      onChange({
        target_weekly_tss_min: nextMin,
        target_weekly_tss_max: nextMin,
      });
      return;
    }

    onChange({ target_weekly_tss_min: nextMin });
  };

  const handleMaxTssChange = (value: number) => {
    const nextMax = Math.max(clampTss(value), data.target_weekly_tss_min);
    onChange({ target_weekly_tss_max: nextMax });
  };

  return (
    <View className="gap-6">
      {/* Header with description */}
      <View className="gap-2">
        <Text className="text-2xl font-bold">Weekly Training Targets</Text>
        <Text className="text-muted-foreground">
          Set your weekly Training Stress Score (TSS) range and activity frequency goals.
        </Text>
      </View>

      {/* TSS Range */}
      <View className="gap-3">
        <Label className="text-base font-semibold">Weekly TSS Range</Label>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <IntegerStepper
              id="weekly-target-min-tss"
              label="Min TSS"
              value={data.target_weekly_tss_min}
              min={TSS_MIN}
              max={TSS_MAX}
              onChange={handleMinTssChange}
              error={errors.tss_min}
            />
          </View>
          <View className="flex-1">
            <IntegerStepper
              id="weekly-target-max-tss"
              label="Max TSS"
              value={data.target_weekly_tss_max}
              min={TSS_MIN}
              max={TSS_MAX}
              onChange={handleMaxTssChange}
              error={errors.tss_max}
            />
          </View>
        </View>

        {/* Validation indicator */}
        {tssRangeValid && data.target_weekly_tss_min > 0 && data.target_weekly_tss_max > 0 && (
          <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md">
            <Icon as={CheckCircle} size={16} className="text-success" />
            <Text className="text-success text-sm">Valid TSS range</Text>
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
      {data.target_weekly_tss_min > 0 &&
        data.target_weekly_tss_max > 0 &&
        data.target_activities_per_week > 0 && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 gap-3">
              <View className="flex-row items-center gap-2">
                <Icon as={Info} size={20} className="text-primary" />
                <Text className="font-semibold text-primary">Training Preview</Text>
              </View>

              <View className="gap-2">
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">Average TSS per activity:</Text>
                  <Text className="font-semibold">{avgTssPerActivity} TSS</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">Weekly TSS range:</Text>
                  <Text className="font-semibold">
                    {data.target_weekly_tss_min} - {data.target_weekly_tss_max} TSS
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
            • Start conservative with TSS targets and build gradually
          </Text>
          <Text className="text-sm text-muted-foreground">
            • A typical recovery week is 50-80 TSS per activity
          </Text>
          <Text className="text-sm text-muted-foreground">
            • Hard training sessions are typically 100-200 TSS
          </Text>
          <Text className="text-sm text-muted-foreground">
            • Most athletes train 3-6 times per week
          </Text>
        </CardContent>
      </Card>

      {/* Warning for unrealistic values */}
      {avgTssPerActivity > 300 && (
        <Card className="bg-destructive/10 border-destructive">
          <CardContent className="p-4 flex-row items-start gap-2">
            <Icon as={AlertCircle} size={20} className="text-destructive mt-0.5" />
            <View className="flex-1">
              <Text className="text-destructive font-semibold mb-1">Warning: Very High TSS</Text>
              <Text className="text-destructive text-sm">
                Your average TSS per activity ({avgTssPerActivity}) is very high. This might be
                unrealistic for most athletes. Consider adjusting your targets.
              </Text>
            </View>
          </CardContent>
        </Card>
      )}
    </View>
  );
}
