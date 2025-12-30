import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
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
  const [minTssText, setMinTssText] = React.useState(data.target_weekly_tss_min.toString());
  const [maxTssText, setMaxTssText] = React.useState(data.target_weekly_tss_max.toString());
  const [activitiesText, setActivitiesText] = React.useState(
    data.target_activities_per_week.toString()
  );

  // Calculate average TSS per activity
  const avgTssPerActivity = React.useMemo(() => {
    const min = parseInt(minTssText) || 0;
    const max = parseInt(maxTssText) || 0;
    const activities = parseInt(activitiesText) || 1;
    const avgWeekly = (min + max) / 2;
    return Math.round(avgWeekly / activities);
  }, [minTssText, maxTssText, activitiesText]);

  // Validation states
  const tssRangeValid =
    !errors.tss_min && !errors.tss_max && parseInt(maxTssText) >= parseInt(minTssText);
  const activitiesValid = !errors.activities_per_week;

  const handleMinTssChange = (text: string) => {
    setMinTssText(text);
    const value = parseInt(text);
    if (!isNaN(value)) {
      onChange({ target_weekly_tss_min: value });
    }
  };

  const handleMaxTssChange = (text: string) => {
    setMaxTssText(text);
    const value = parseInt(text);
    if (!isNaN(value)) {
      onChange({ target_weekly_tss_max: value });
    }
  };

  const handleActivitiesChange = (text: string) => {
    setActivitiesText(text);
    const value = parseInt(text);
    if (!isNaN(value)) {
      onChange({ target_activities_per_week: value });
    }
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
            <Label>Min TSS</Label>
            <Input
              value={minTssText}
              onChangeText={handleMinTssChange}
              keyboardType="numeric"
              placeholder="150"
              className={errors.tss_min ? "border-destructive" : ""}
            />
            {errors.tss_min && (
              <Text className="text-destructive text-xs mt-1">{errors.tss_min}</Text>
            )}
          </View>
          <View className="flex-1">
            <Label>Max TSS</Label>
            <Input
              value={maxTssText}
              onChangeText={handleMaxTssChange}
              keyboardType="numeric"
              placeholder="300"
              className={errors.tss_max ? "border-destructive" : ""}
            />
            {errors.tss_max && (
              <Text className="text-destructive text-xs mt-1">{errors.tss_max}</Text>
            )}
          </View>
        </View>

        {/* Validation indicator */}
        {tssRangeValid && parseInt(minTssText) > 0 && parseInt(maxTssText) > 0 && (
          <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md">
            <Icon as={CheckCircle} size={16} className="text-success" />
            <Text className="text-success text-sm">Valid TSS range</Text>
          </View>
        )}
      </View>

      {/* Activities Per Week */}
      <View className="gap-3">
        <Label className="text-base font-semibold">Activities Per Week</Label>
        <Input
          value={activitiesText}
          onChangeText={handleActivitiesChange}
          keyboardType="numeric"
          placeholder="4"
          className={errors.activities_per_week ? "border-destructive" : ""}
        />
        {errors.activities_per_week && (
          <Text className="text-destructive text-xs mt-1">{errors.activities_per_week}</Text>
        )}

        {/* Validation indicator */}
        {activitiesValid && parseInt(activitiesText) > 0 && (
          <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md">
            <Icon as={CheckCircle} size={16} className="text-success" />
            <Text className="text-success text-sm">Valid activity count</Text>
          </View>
        )}
      </View>

      {/* Preview Card */}
      {parseInt(minTssText) > 0 &&
        parseInt(maxTssText) > 0 &&
        parseInt(activitiesText) > 0 && (
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
                    {minTssText} - {maxTssText} TSS
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">Activities per week:</Text>
                  <Text className="font-semibold">{activitiesText}</Text>
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
              <Text className="text-destructive font-semibold mb-1">
                Warning: Very High TSS
              </Text>
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
