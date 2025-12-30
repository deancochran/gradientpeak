import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Pressable, View } from "react-native";

interface Step3PeriodizationProps {
  usePeriodization: boolean;
  startingCTL?: number;
  targetCTL?: number;
  rampRate?: number;
  onUsePeriodizationChange: (value: boolean) => void;
  onStartingCTLChange: (value: number) => void;
  onTargetCTLChange: (value: number) => void;
  onRampRateChange: (value: number) => void;
  errors?: {
    periodization?: string;
  };
}

/**
 * Step 3: Periodization (Optional)
 * Streamlined periodization setup for progressive fitness building
 */
export function Step3Periodization({
  usePeriodization,
  startingCTL = 0,
  targetCTL = 100,
  rampRate = 5,
  onUsePeriodizationChange,
  onStartingCTLChange,
  onTargetCTLChange,
  onRampRateChange,
  errors,
}: Step3PeriodizationProps) {
  // Calculate estimated weeks to reach target
  const weeksToTarget =
    usePeriodization && targetCTL > startingCTL && rampRate > 0
      ? Math.ceil((targetCTL - startingCTL) / rampRate)
      : null;

  return (
    <View className="gap-6">
      {/* Toggle Section */}
      <View className="gap-3">
        <View>
          <Text className="text-lg font-semibold">Periodization</Text>
          <Text className="text-sm text-muted-foreground mt-1">
            Optional: Build fitness progressively toward a goal
          </Text>
        </View>

        {/* Toggle Buttons */}
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => onUsePeriodizationChange(false)}
            className={`flex-1 border-2 rounded-lg p-3 ${
              !usePeriodization
                ? "border-primary bg-primary/5"
                : "border-border bg-card"
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                !usePeriodization ? "text-primary" : "text-foreground"
              }`}
            >
              Skip
            </Text>
            <Text className="text-xs text-muted-foreground text-center mt-1">
              Simple plan
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onUsePeriodizationChange(true)}
            className={`flex-1 border-2 rounded-lg p-3 ${
              usePeriodization
                ? "border-primary bg-primary/5"
                : "border-border bg-card"
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                usePeriodization ? "text-primary" : "text-foreground"
              }`}
            >
              Enable
            </Text>
            <Text className="text-xs text-muted-foreground text-center mt-1">
              Progressive build
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Periodization Inputs (only show if enabled) */}
      {usePeriodization ? (
        <View className="gap-5">
          {/* Starting CTL */}
          <View className="gap-2">
            <Label nativeID="starting-ctl">
              <Text className="text-sm font-medium">Current Fitness (CTL)</Text>
            </Label>
            <Input
              aria-labelledby="starting-ctl"
              placeholder="0"
              value={startingCTL.toString()}
              onChangeText={(text) => onStartingCTLChange(parseInt(text) || 0)}
              keyboardType="numeric"
            />
            <Text className="text-xs text-muted-foreground">
              Your current Chronic Training Load (0 if starting fresh)
            </Text>
          </View>

          {/* Target CTL */}
          <View className="gap-2">
            <Label nativeID="target-ctl">
              <Text className="text-sm font-medium">Target Fitness (CTL)</Text>
            </Label>
            <Input
              aria-labelledby="target-ctl"
              placeholder="100"
              value={targetCTL.toString()}
              onChangeText={(text) => onTargetCTLChange(parseInt(text) || 0)}
              keyboardType="numeric"
            />
            <Text className="text-xs text-muted-foreground">
              Goal fitness level for your target event (50-150 typical)
            </Text>
          </View>

          {/* Ramp Rate */}
          <View className="gap-2">
            <Label nativeID="ramp-rate">
              <Text className="text-sm font-medium">
                Weekly Ramp Rate (CTL/week)
              </Text>
            </Label>
            <Input
              aria-labelledby="ramp-rate"
              placeholder="5"
              value={rampRate.toString()}
              onChangeText={(text) => onRampRateChange(parseFloat(text) || 0)}
              keyboardType="decimal-pad"
            />
            <Text className="text-xs text-muted-foreground">
              How much to increase fitness per week (3-7 recommended)
            </Text>
          </View>

          {/* Error Display */}
          {errors?.periodization && (
            <View className="bg-destructive/10 rounded-lg p-3">
              <Text className="text-sm text-destructive">
                {errors.periodization}
              </Text>
            </View>
          )}

          {/* Timeline Preview */}
          {weeksToTarget && weeksToTarget > 0 && (
            <View className="bg-primary/10 rounded-lg p-4">
              <Text className="text-sm font-semibold text-primary mb-3">
                📅 Estimated Timeline
              </Text>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-xs text-muted-foreground">
                    Fitness Gain
                  </Text>
                  <Text className="text-lg font-bold">
                    {startingCTL} → {targetCTL}
                  </Text>
                </View>
                <View className="h-10 w-px bg-border" />
                <View>
                  <Text className="text-xs text-muted-foreground">
                    Time Needed
                  </Text>
                  <Text className="text-lg font-bold text-primary">
                    ~{weeksToTarget} weeks
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Guidance */}
          <View className="bg-muted/30 rounded-lg p-3">
            <Text className="text-xs text-muted-foreground leading-5">
              💡 <Text className="font-semibold">Tip:</Text> A conservative ramp
              rate (3-5 CTL/week) reduces injury risk. Include recovery weeks
              every 3-4 weeks by reducing volume 20-30%.
            </Text>
          </View>
        </View>
      ) : (
        /* Show info when periodization is disabled */
        <View className="bg-muted/30 rounded-lg p-4">
          <Text className="text-sm text-muted-foreground leading-6">
            Without periodization, you'll manually manage your training load
            week by week. You can always enable this later in your plan
            settings.
          </Text>
        </View>
      )}
    </View>
  );
}
