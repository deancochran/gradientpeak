import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { View } from "react-native";

interface Step3RecoveryRulesProps {
  maxConsecutiveDays: number;
  minRestDays: number;
  minHoursBetweenHard: number;
  onMaxConsecutiveDaysChange: (value: number) => void;
  onMinRestDaysChange: (value: number) => void;
  onMinHoursBetweenHardChange: (value: number) => void;
  errors?: {
    maxConsecutiveDays?: string;
    minRestDays?: string;
    minHoursBetweenHard?: string;
  };
}

/**
 * Step 3: Recovery Rules
 * Sets recovery constraints to prevent overtraining
 */
export function Step3RecoveryRules({
  maxConsecutiveDays,
  minRestDays,
  minHoursBetweenHard,
  onMaxConsecutiveDaysChange,
  onMinRestDaysChange,
  onMinHoursBetweenHardChange,
  errors,
}: Step3RecoveryRulesProps) {
  const handleMaxConsecutiveChange = (text: string) => {
    const value = parseInt(text) || 0;
    onMaxConsecutiveDaysChange(value);
  };

  const handleMinRestDaysChange = (text: string) => {
    const value = parseInt(text) || 0;
    onMinRestDaysChange(value);
  };

  const handleMinHoursChange = (text: string) => {
    const value = parseInt(text) || 0;
    onMinHoursBetweenHardChange(value);
  };

  return (
    <View className="gap-6">
      {/* Introduction */}
      <View className="bg-muted/30 rounded-lg p-4">
        <Text className="text-sm text-muted-foreground leading-6">
          Recovery is essential for fitness gains. Set rules to ensure adequate
          rest between hard efforts and throughout your training week.
        </Text>
      </View>

      {/* Max Consecutive Training Days */}
      <View className="gap-2">
        <Label nativeID="max-consecutive">
          <Text className="text-base font-semibold">
            Maximum Consecutive Training Days{" "}
            <Text className="text-destructive">*</Text>
          </Text>
        </Label>
        <Text className="text-sm text-muted-foreground mb-2">
          How many days in a row can you train before needing rest?
        </Text>
        <Input
          aria-labelledby="max-consecutive"
          placeholder="3"
          value={maxConsecutiveDays.toString()}
          onChangeText={handleMaxConsecutiveChange}
          keyboardType="numeric"
        />
        {errors?.maxConsecutiveDays && (
          <Text className="text-sm text-destructive">
            {errors.maxConsecutiveDays}
          </Text>
        )}
        <View className="bg-muted/50 rounded-lg p-3 mt-2">
          <Text className="text-xs text-muted-foreground">
            Recommended: 2-4 days for most athletes
          </Text>
        </View>
      </View>

      {/* Min Rest Days Per Week */}
      <View className="gap-2">
        <Label nativeID="min-rest-days">
          <Text className="text-base font-semibold">
            Minimum Rest Days per Week{" "}
            <Text className="text-destructive">*</Text>
          </Text>
        </Label>
        <Text className="text-sm text-muted-foreground mb-2">
          How many complete rest days do you need each week?
        </Text>
        <Input
          aria-labelledby="min-rest-days"
          placeholder="1"
          value={minRestDays.toString()}
          onChangeText={handleMinRestDaysChange}
          keyboardType="numeric"
        />
        {errors?.minRestDays && (
          <Text className="text-sm text-destructive">{errors.minRestDays}</Text>
        )}
        <View className="bg-muted/50 rounded-lg p-3 mt-2">
          <Text className="text-xs text-muted-foreground">
            Recommended: At least 1 complete rest day per week
          </Text>
        </View>
      </View>

      {/* Min Hours Between Hard Activities */}
      <View className="gap-2">
        <Label nativeID="min-hours-hard">
          <Text className="text-base font-semibold">
            Minimum Hours Between Hard Activities{" "}
            <Text className="text-destructive">*</Text>
          </Text>
        </Label>
        <Text className="text-sm text-muted-foreground mb-2">
          How much recovery time between high-intensity sessions?
        </Text>
        <Input
          aria-labelledby="min-hours-hard"
          placeholder="48"
          value={minHoursBetweenHard.toString()}
          onChangeText={handleMinHoursChange}
          keyboardType="numeric"
        />
        {errors?.minHoursBetweenHard && (
          <Text className="text-sm text-destructive">
            {errors.minHoursBetweenHard}
          </Text>
        )}
        <View className="bg-muted/50 rounded-lg p-3 mt-2">
          <Text className="text-xs text-muted-foreground">
            Recommended: 48-72 hours (2-3 days) between hard efforts
          </Text>
        </View>
      </View>

      {/* Summary Card */}
      <View className="bg-primary/10 rounded-lg p-4">
        <Text className="text-sm font-semibold text-primary mb-3">
          Your Recovery Plan
        </Text>
        <View className="gap-2">
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted-foreground">
              Training days in a row:
            </Text>
            <Text className="text-sm font-semibold">
              Up to {maxConsecutiveDays} days
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted-foreground">
              Rest days/week:
            </Text>
            <Text className="text-sm font-semibold">
              At least {minRestDays} day{minRestDays !== 1 ? "s" : ""}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted-foreground">
              Hard activity spacing:
            </Text>
            <Text className="text-sm font-semibold">
              {minHoursBetweenHard} hours (
              {Math.round(minHoursBetweenHard / 24)} days)
            </Text>
          </View>
        </View>
      </View>

      {/* Guidance */}
      <View className="bg-blue-500/10 rounded-lg p-4">
        <Text className="text-sm font-semibold text-blue-600 mb-2">
          🛡️ Why Recovery Matters
        </Text>
        <Text className="text-sm text-muted-foreground leading-5">
          • <Text className="font-semibold">Prevents overtraining:</Text> Rest
          days allow your body to adapt and get stronger
          {"\n"}• <Text className="font-semibold">Reduces injury risk:</Text>{" "}
          Adequate spacing between hard activities prevents cumulative fatigue
          {"\n"}• <Text className="font-semibold">Improves performance:</Text>{" "}
          Fresh legs = better quality activities
          {"\n"}• <Text className="font-semibold">Sustainable training:</Text>{" "}
          Long-term consistency beats short-term intensity
        </Text>
      </View>
    </View>
  );
}
