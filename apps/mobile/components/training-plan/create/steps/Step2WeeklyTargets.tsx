import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { View } from "react-native";

interface Step2WeeklyTargetsProps {
  tssMin: number;
  tssMax: number;
  activitiesPerWeek: number;
  maxConsecutiveDays: number;
  minRestDays: number;
  onTssMinChange: (value: number) => void;
  onTssMaxChange: (value: number) => void;
  onActivitiesPerWeekChange: (value: number) => void;
  onMaxConsecutiveDaysChange: (value: number) => void;
  onMinRestDaysChange: (value: number) => void;
  errors?: {
    tssMin?: string;
    tssMax?: string;
    activitiesPerWeek?: string;
    maxConsecutiveDays?: string;
    minRestDays?: string;
  };
}

/**
 * Step 2: Training Schedule
 * Combines weekly targets and recovery rules in a streamlined view
 */
export function Step2WeeklyTargets({
  tssMin,
  tssMax,
  activitiesPerWeek,
  maxConsecutiveDays,
  minRestDays,
  onTssMinChange,
  onTssMaxChange,
  onActivitiesPerWeekChange,
  onMaxConsecutiveDaysChange,
  onMinRestDaysChange,
  errors,
}: Step2WeeklyTargetsProps) {
  const averageTSS = Math.round((tssMin + tssMax) / 2);
  const avgPerActivity =
    activitiesPerWeek > 0 ? Math.round(averageTSS / activitiesPerWeek) : 0;

  return (
    <View className="gap-6">
      {/* Weekly Training Load */}
      <View className="gap-4">
        <View>
          <Text className="text-lg font-semibold">Weekly Training Load</Text>
          <Text className="text-sm text-muted-foreground mt-1">
            Set your target TSS range per week
          </Text>
        </View>

        <View className="flex-row gap-3">
          {/* Min TSS */}
          <View className="flex-1 gap-2">
            <Label nativeID="tss-min">
              <Text className="text-sm font-medium">Min TSS</Text>
            </Label>
            <Input
              aria-labelledby="tss-min"
              placeholder="200"
              value={tssMin.toString()}
              onChangeText={(text) => onTssMinChange(parseInt(text) || 0)}
              keyboardType="numeric"
            />
            {errors?.tssMin && (
              <Text className="text-xs text-destructive">{errors.tssMin}</Text>
            )}
          </View>

          {/* Max TSS */}
          <View className="flex-1 gap-2">
            <Label nativeID="tss-max">
              <Text className="text-sm font-medium">Max TSS</Text>
            </Label>
            <Input
              aria-labelledby="tss-max"
              placeholder="400"
              value={tssMax.toString()}
              onChangeText={(text) => onTssMaxChange(parseInt(text) || 0)}
              keyboardType="numeric"
            />
            {errors?.tssMax && (
              <Text className="text-xs text-destructive">{errors.tssMax}</Text>
            )}
          </View>
        </View>

        {/* Summary Card */}
        <View className="bg-primary/10 rounded-lg p-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm text-muted-foreground">Avg Weekly</Text>
              <Text className="text-2xl font-bold text-primary">
                {averageTSS}
              </Text>
            </View>
            <View className="h-10 w-px bg-border" />
            <View>
              <Text className="text-sm text-muted-foreground">
                Per Activity
              </Text>
              <Text className="text-2xl font-bold text-primary">
                ~{avgPerActivity}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Activities Per Week */}
      <View className="gap-2">
        <Label nativeID="activities-per-week">
          <Text className="text-sm font-medium">Activities per Week</Text>
        </Label>
        <Input
          aria-labelledby="activities-per-week"
          placeholder="4"
          value={activitiesPerWeek.toString()}
          onChangeText={(text) =>
            onActivitiesPerWeekChange(parseInt(text) || 0)
          }
          keyboardType="numeric"
        />
        {errors?.activitiesPerWeek && (
          <Text className="text-xs text-destructive">
            {errors.activitiesPerWeek}
          </Text>
        )}
      </View>

      {/* Recovery Rules Section */}
      <View className="gap-4 pt-2">
        <View className="border-t border-border pt-4">
          <Text className="text-lg font-semibold">Recovery Rules</Text>
          <Text className="text-sm text-muted-foreground mt-1">
            Set constraints to prevent overtraining
          </Text>
        </View>

        <View className="flex-row gap-3">
          {/* Max Consecutive Days */}
          <View className="flex-1 gap-2">
            <Label nativeID="max-consecutive">
              <Text className="text-sm font-medium">Max Days in a Row</Text>
            </Label>
            <Input
              aria-labelledby="max-consecutive"
              placeholder="3"
              value={maxConsecutiveDays.toString()}
              onChangeText={(text) =>
                onMaxConsecutiveDaysChange(parseInt(text) || 0)
              }
              keyboardType="numeric"
            />
            {errors?.maxConsecutiveDays && (
              <Text className="text-xs text-destructive">
                {errors.maxConsecutiveDays}
              </Text>
            )}
          </View>

          {/* Min Rest Days */}
          <View className="flex-1 gap-2">
            <Label nativeID="min-rest">
              <Text className="text-sm font-medium">Rest Days/Week</Text>
            </Label>
            <Input
              aria-labelledby="min-rest"
              placeholder="2"
              value={minRestDays.toString()}
              onChangeText={(text) => onMinRestDaysChange(parseInt(text) || 0)}
              keyboardType="numeric"
            />
            {errors?.minRestDays && (
              <Text className="text-xs text-destructive">
                {errors.minRestDays}
              </Text>
            )}
          </View>
        </View>

        {/* Recovery Summary */}
        <View className="bg-muted/30 rounded-lg p-3">
          <Text className="text-xs text-muted-foreground leading-5">
            Your schedule: Train up to {maxConsecutiveDays} days in a row with
            at least {minRestDays} rest day{minRestDays !== 1 ? "s" : ""} per
            week
          </Text>
        </View>
      </View>
    </View>
  );
}
