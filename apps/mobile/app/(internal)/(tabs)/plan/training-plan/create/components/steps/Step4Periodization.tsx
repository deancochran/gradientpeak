import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { useState } from "react";
import { View } from "react-native";

interface Step5PeriodizationProps {
  periodization?: {
    startingCTL: number;
    targetCTL: number;
    rampRate: number;
    targetDate: Date | null;
  };
  onPeriodizationChange: (
    field: "startingCTL" | "targetCTL" | "rampRate" | "targetDate",
    value: number | Date | null,
  ) => void;
  errors?: {
    periodization?: string;
  };
}

/**
 * Step 4: Periodization (Optional)
 * Sets optional periodization parameters for progressive overload
 */
export function Step4Periodization({
  periodization,
  onPeriodizationChange,
  errors,
}: Step5PeriodizationProps) {
  const [isEnabled, setIsEnabled] = useState(!!periodization);

  const handleStartingCTLChange = (text: string) => {
    const value = parseInt(text) || 0;
    onPeriodizationChange("startingCTL", value);
  };

  const handleTargetCTLChange = (text: string) => {
    const value = parseInt(text) || 0;
    onPeriodizationChange("targetCTL", value);
  };

  const handleRampRateChange = (text: string) => {
    const value = parseFloat(text) || 0;
    onPeriodizationChange("rampRate", value);
  };

  const handleEnablePeriodization = () => {
    setIsEnabled(true);
    // Initialize with default values if not set
    if (!periodization) {
      onPeriodizationChange("startingCTL", 0);
      onPeriodizationChange("targetCTL", 100);
      onPeriodizationChange("rampRate", 5);
      onPeriodizationChange("targetDate", null);
    }
  };

  const handleDisablePeriodization = () => {
    setIsEnabled(false);
  };

  // Calculate estimated weeks to reach target
  const calculateWeeksToTarget = () => {
    if (!periodization || !isEnabled) return null;

    const { startingCTL, targetCTL, rampRate } = periodization;
    if (startingCTL >= targetCTL || rampRate <= 0) return null;

    const ctlGain = targetCTL - startingCTL;
    const weeksNeeded = Math.ceil(ctlGain / rampRate);
    return weeksNeeded;
  };

  const weeksToTarget = calculateWeeksToTarget();

  return (
    <View className="gap-6">
      {/* Introduction */}
      <View className="bg-muted/30 rounded-lg p-4">
        <Text className="text-sm text-muted-foreground leading-6">
          <Text className="font-semibold">Optional:</Text> Add periodization to
          progressively build fitness (CTL) toward a goal. This helps ensure
          gradual, sustainable progression.
        </Text>
      </View>

      {/* Enable/Disable Toggle */}
      {!isEnabled ? (
        <View className="gap-4">
          <View className="bg-primary/5 rounded-lg p-6 items-center">
            <Text className="text-lg font-semibold mb-2">
              Skip Periodization?
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-4">
              Periodization is optional. You can create a simple training plan
              without it and manage CTL progression manually.
            </Text>
            <View className="flex-row gap-3 w-full">
              <Button
                variant="outline"
                onPress={handleEnablePeriodization}
                className="flex-1"
              >
                <Text className="text-foreground font-medium">
                  Set Up Periodization
                </Text>
              </Button>
              <Button variant="default" className="flex-1">
                <Text className="text-primary-foreground font-semibold">
                  Skip This Step
                </Text>
              </Button>
            </View>
          </View>

          {/* Benefits Info */}
          <View className="bg-blue-500/10 rounded-lg p-4">
            <Text className="text-sm font-semibold text-blue-600 mb-2">
              📈 Benefits of Periodization
            </Text>
            <Text className="text-sm text-muted-foreground leading-5">
              • <Text className="font-semibold">Progressive overload:</Text>{" "}
              Gradual increase in training load
              {"\n"}• <Text className="font-semibold">Goal-oriented:</Text> Plan
              backward from your target event
              {"\n"}• <Text className="font-semibold">Injury prevention:</Text>{" "}
              Controlled ramp rate reduces risk
              {"\n"}• <Text className="font-semibold">Peak performance:</Text>{" "}
              Arrive at your goal with optimal fitness
            </Text>
          </View>
        </View>
      ) : (
        <View className="gap-5">
          {/* Disable Button */}
          <Button
            variant="ghost"
            onPress={handleDisablePeriodization}
            size="sm"
            className="self-start"
          >
            <Text className="text-muted-foreground text-xs">
              ← Skip periodization
            </Text>
          </Button>

          {/* Starting CTL */}
          <View className="gap-2">
            <Label nativeID="starting-ctl">
              <Text className="text-base font-semibold">
                Current Fitness (Starting CTL)
              </Text>
            </Label>
            <Text className="text-sm text-muted-foreground mb-2">
              Your current chronic training load. Use 0 if starting fresh.
            </Text>
            <Input
              aria-labelledby="starting-ctl"
              placeholder="0"
              value={periodization?.startingCTL.toString() || "0"}
              onChangeText={handleStartingCTLChange}
              keyboardType="numeric"
            />
            <Text className="text-xs text-muted-foreground">
              Typical range: 0-150 for most athletes
            </Text>
          </View>

          {/* Target CTL */}
          <View className="gap-2">
            <Label nativeID="target-ctl">
              <Text className="text-base font-semibold">
                Target Fitness (Goal CTL)
              </Text>
            </Label>
            <Text className="text-sm text-muted-foreground mb-2">
              The fitness level you want to reach for your goal event.
            </Text>
            <Input
              aria-labelledby="target-ctl"
              placeholder="100"
              value={periodization?.targetCTL.toString() || "100"}
              onChangeText={handleTargetCTLChange}
              keyboardType="numeric"
            />
            <Text className="text-xs text-muted-foreground">
              Typical range: 50-120 for recreational athletes, 120+ for
              competitive
            </Text>
          </View>

          {/* Ramp Rate */}
          <View className="gap-2">
            <Label nativeID="ramp-rate">
              <Text className="text-base font-semibold">
                Weekly Ramp Rate (CTL gain per week)
              </Text>
            </Label>
            <Text className="text-sm text-muted-foreground mb-2">
              How fast to build fitness. Conservative = 3-5, Aggressive = 7-10
            </Text>
            <Input
              aria-labelledby="ramp-rate"
              placeholder="5"
              value={periodization?.rampRate.toString() || "5"}
              onChangeText={handleRampRateChange}
              keyboardType="decimal-pad"
            />
            <Text className="text-xs text-muted-foreground">
              Recommended: 3-7 CTL points per week for sustainable growth
            </Text>
          </View>

          {/* Target Date (Coming Soon) */}
          <View className="gap-2">
            <Label nativeID="target-date">
              <Text className="text-base font-semibold">Target Event Date</Text>
            </Label>
            <Text className="text-sm text-muted-foreground mb-2">
              (Coming soon) The date of your goal race or event
            </Text>
            <View className="bg-muted/50 rounded-lg p-3">
              <Text className="text-sm text-muted-foreground italic">
                Date picker will be available in a future update
              </Text>
            </View>
          </View>

          {/* Timeline Estimate */}
          {weeksToTarget && weeksToTarget > 0 && (
            <View className="bg-primary/10 rounded-lg p-4">
              <Text className="text-sm font-semibold text-primary mb-3">
                📅 Estimated Timeline
              </Text>
              <View className="gap-2">
                <View className="flex-row justify-between">
                  <Text className="text-sm text-muted-foreground">
                    Starting CTL:
                  </Text>
                  <Text className="text-sm font-semibold">
                    {periodization?.startingCTL}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-sm text-muted-foreground">
                    Target CTL:
                  </Text>
                  <Text className="text-sm font-semibold">
                    {periodization?.targetCTL}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-sm text-muted-foreground">
                    Weekly gain:
                  </Text>
                  <Text className="text-sm font-semibold">
                    +{periodization?.rampRate} CTL/week
                  </Text>
                </View>
                <View className="h-px bg-border my-1" />
                <View className="flex-row justify-between">
                  <Text className="text-sm font-semibold text-primary">
                    Time to goal:
                  </Text>
                  <Text className="text-lg font-bold text-primary">
                    ~{weeksToTarget} weeks
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Error Message */}
          {errors?.periodization && (
            <View className="bg-destructive/10 rounded-lg p-3">
              <Text className="text-sm text-destructive">
                {errors.periodization}
              </Text>
            </View>
          )}

          {/* Guidance */}
          <View className="bg-blue-500/10 rounded-lg p-4">
            <Text className="text-sm font-semibold text-blue-600 mb-2">
              🎯 Periodization Tips
            </Text>
            <Text className="text-sm text-muted-foreground leading-5">
              • <Text className="font-semibold">Conservative approach:</Text>{" "}
              3-5 CTL points per week reduces injury risk
              {"\n"}• <Text className="font-semibold">Build base first:</Text>{" "}
              Focus on volume before intensity
              {"\n"}•{" "}
              <Text className="font-semibold">Include recovery weeks:</Text>{" "}
              Every 3-4 weeks, reduce volume by 20-30%
              {"\n"}•{" "}
              <Text className="font-semibold">Listen to your body:</Text> Adjust
              if feeling overtrained
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
