import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import {
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Calendar as CalendarIcon,
  Lock,
} from "lucide-react-native";
import React from "react";
import { View, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

interface PeriodizationTemplate {
  starting_ctl: number;
  target_ctl: number;
  ramp_rate: number;
  target_date: string;
}

interface PeriodizationFormProps {
  data: PeriodizationTemplate | null | undefined;
  onChange: (data: PeriodizationTemplate | null) => void;
  errors: Record<string, string>;
  currentCTL?: number; // Current CTL from API (read-only)
}

export function PeriodizationForm({
  data,
  onChange,
  errors,
  currentCTL = 0, // Default to 0 for new users
}: PeriodizationFormProps) {
  const [isEnabled, setIsEnabled] = React.useState(!!data);
  const [showDatePicker, setShowDatePicker] = React.useState(false);

  // Use currentCTL as starting point (not editable)
  const startingCtl = currentCTL;

  const [targetCtlText, setTargetCtlText] = React.useState(
    data?.target_ctl?.toString() || "85",
  );
  const [rampRateText, setRampRateText] = React.useState(
    data?.ramp_rate ? (data.ramp_rate * 100).toFixed(0) : "5",
  );
  const [targetDate, setTargetDate] = React.useState<Date>(
    data?.target_date
      ? new Date(data.target_date)
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  );

  // Calculate progression preview
  const progressionPreview = React.useMemo(() => {
    const startCtl = startingCtl;
    const targetCtl = parseInt(targetCtlText) || 0;
    const rampRate = (parseInt(rampRateText) || 5) / 100;

    const now = new Date();
    const daysToTarget = Math.floor(
      (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    const weeksToTarget = Math.floor(daysToTarget / 7);

    // Calculate if the progression is achievable
    let currentCtl = startCtl;
    let weeksNeeded = 0;

    while (currentCtl < targetCtl && weeksNeeded < 100) {
      currentCtl += currentCtl * rampRate;
      weeksNeeded++;
    }

    return {
      daysToTarget,
      weeksToTarget,
      weeksNeeded,
      achievable: weeksNeeded <= weeksToTarget,
      ctlIncrease: targetCtl - startCtl,
      weeklyGain:
        weeksToTarget > 0 ? (targetCtl - startCtl) / weeksToTarget : 0,
    };
  }, [startingCtl, targetCtlText, rampRateText, targetDate]);

  const handleToggle = (enabled: boolean) => {
    setIsEnabled(enabled);
    if (!enabled) {
      onChange(null);
    } else {
      onChange({
        starting_ctl: startingCtl,
        target_ctl: parseInt(targetCtlText) || 85,
        ramp_rate: (parseInt(rampRateText) || 5) / 100,
        target_date: targetDate.toISOString().split("T")[0] || "",
      });
    }
  };

  const handleTargetCtlChange = (text: string) => {
    setTargetCtlText(text);
    const value = parseInt(text);
    if (!isNaN(value) && isEnabled) {
      onChange({
        starting_ctl: startingCtl,
        target_ctl: value,
        ramp_rate: (parseInt(rampRateText) || 5) / 100,
        target_date: targetDate.toISOString().split("T")[0] || "",
      });
    }
  };

  const handleRampRateChange = (text: string) => {
    setRampRateText(text);
    const value = parseInt(text);
    if (!isNaN(value) && isEnabled) {
      onChange({
        starting_ctl: startingCtl,
        target_ctl: parseInt(targetCtlText) || 85,
        ramp_rate: value / 100,
        target_date: targetDate.toISOString().split("T")[0] || "",
      });
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setTargetDate(selectedDate);
      if (isEnabled) {
        onChange({
          starting_ctl: startingCtl,
          target_ctl: parseInt(targetCtlText) || 85,
          ramp_rate: (parseInt(rampRateText) || 5) / 100,
          target_date: selectedDate.toISOString().split("T")[0] || "",
        });
      }
    }
  };

  return (
    <View className="gap-6">
      {/* Header */}
      <View className="gap-2">
        <Text className="text-2xl font-bold">Periodization Planning</Text>
        <Text className="text-muted-foreground">
          Use periodization to progressively build your Chronic Training Load
          (CTL) toward a specific goal or event.
        </Text>
      </View>

      {/* Enable/Disable Toggle */}
      <Card>
        <CardContent className="p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="font-semibold mb-1">
                Enable Periodization Planning
              </Text>
              <Text className="text-sm text-muted-foreground">
                Plan your training progression toward a target date and fitness
                level
              </Text>
            </View>
            <Switch checked={isEnabled} onCheckedChange={handleToggle} />
          </View>
        </CardContent>
      </Card>

      {/* Periodization Form (only shown when enabled) */}
      {isEnabled && (
        <>
          {/* Current CTL (Read-Only) */}
          <View className="gap-3">
            <Label className="text-base font-semibold">
              Your Current Fitness
            </Label>
            <Card className="bg-muted/50 border-muted">
              <CardContent className="p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Icon
                        as={Lock}
                        size={16}
                        className="text-muted-foreground"
                      />
                      <Text className="text-sm text-muted-foreground font-medium">
                        Starting CTL
                      </Text>
                    </View>
                    <Text className="text-3xl font-bold text-foreground">
                      {startingCtl} CTL
                    </Text>
                    {startingCtl === 0 ? (
                      <Text className="text-xs text-muted-foreground mt-2">
                        Your fitness will update as you sync activities from
                        connected services
                      </Text>
                    ) : (
                      <Text className="text-xs text-muted-foreground mt-2">
                        Calculated from your last 42 days of training
                      </Text>
                    )}
                  </View>
                </View>
              </CardContent>
            </Card>
          </View>

          {/* Target CTL */}
          <View className="gap-3">
            <Label className="text-base font-semibold">Target CTL</Label>
            <Text className="text-sm text-muted-foreground">
              The fitness level you want to reach by your target date
            </Text>
            <Input
              value={targetCtlText}
              onChangeText={handleTargetCtlChange}
              keyboardType="numeric"
              placeholder="85"
              className={errors.target_ctl ? "border-destructive" : ""}
            />
            {errors.target_ctl && (
              <Text className="text-destructive text-xs">
                {errors.target_ctl}
              </Text>
            )}
          </View>

          {/* Ramp Rate */}
          <View className="gap-3">
            <Label className="text-base font-semibold">
              Weekly Ramp Rate (%)
            </Label>
            <Text className="text-sm text-muted-foreground">
              How much your CTL increases each week (5-7% is typical)
            </Text>
            <Input
              value={rampRateText}
              onChangeText={handleRampRateChange}
              keyboardType="numeric"
              placeholder="5"
              className={errors.ramp_rate ? "border-destructive" : ""}
            />
            {errors.ramp_rate && (
              <Text className="text-destructive text-xs">
                {errors.ramp_rate}
              </Text>
            )}
          </View>

          {/* Target Date */}
          <View className="gap-3">
            <Label className="text-base font-semibold">Target Date</Label>
            <Text className="text-sm text-muted-foreground">
              Your goal date (event, race, or fitness milestone)
            </Text>
            <Button
              variant="outline"
              onPress={() => setShowDatePicker(true)}
              className="justify-start"
            >
              <Icon
                as={CalendarIcon}
                size={18}
                className="text-foreground mr-2"
              />
              <Text className="text-foreground">
                {targetDate.toLocaleDateString()}
              </Text>
            </Button>
            {showDatePicker && (
              <DateTimePicker
                value={targetDate}
                mode="date"
                display="default"
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
            )}
            {errors.target_date && (
              <Text className="text-destructive text-xs">
                {errors.target_date}
              </Text>
            )}
          </View>

          {/* Progression Preview */}
          {startingCtl > 0 &&
            parseInt(targetCtlText) > 0 &&
            parseInt(rampRateText) > 0 && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 gap-3">
                  <View className="flex-row items-center gap-2">
                    <Icon as={TrendingUp} size={20} className="text-primary" />
                    <Text className="font-semibold text-primary">
                      Progression Preview
                    </Text>
                  </View>

                  <View className="gap-2">
                    <View className="flex-row justify-between">
                      <Text className="text-muted-foreground">
                        CTL increase:
                      </Text>
                      <Text className="font-semibold">
                        +{progressionPreview.ctlIncrease} ({startingCtl} →{" "}
                        {targetCtlText})
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-muted-foreground">
                        Time to target:
                      </Text>
                      <Text className="font-semibold">
                        {progressionPreview.weeksToTarget} weeks (
                        {progressionPreview.daysToTarget} days)
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-muted-foreground">
                        Avg weekly gain:
                      </Text>
                      <Text className="font-semibold">
                        +{progressionPreview.weeklyGain.toFixed(1)} CTL/week
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-muted-foreground">
                        Weeks needed:
                      </Text>
                      <Text className="font-semibold">
                        {progressionPreview.weeksNeeded} weeks
                      </Text>
                    </View>
                  </View>

                  {/* Achievability indicator */}
                  {progressionPreview.achievable ? (
                    <View className="flex-row items-center gap-2 bg-success/10 p-2 rounded-md mt-2">
                      <Icon
                        as={CheckCircle}
                        size={16}
                        className="text-success"
                      />
                      <Text className="text-success text-sm font-medium">
                        Goal is achievable with this plan
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-2 bg-destructive/10 p-2 rounded-md mt-2">
                      <Icon
                        as={AlertCircle}
                        size={16}
                        className="text-destructive"
                      />
                      <Text className="text-destructive text-sm font-medium">
                        Goal may not be achievable - need{" "}
                        {progressionPreview.weeksNeeded} weeks but only have{" "}
                        {progressionPreview.weeksToTarget}
                      </Text>
                    </View>
                  )}
                </CardContent>
              </Card>
            )}

          {/* Tips Card */}
          <Card className="bg-muted/50">
            <CardContent className="p-4 gap-2">
              <Text className="font-semibold mb-1">💡 Periodization Tips</Text>
              <Text className="text-sm text-muted-foreground">
                • CTL of 40-60 is typical for recreational athletes
              </Text>
              <Text className="text-sm text-muted-foreground">
                • CTL of 80-100 is common for competitive athletes
              </Text>
              <Text className="text-sm text-muted-foreground">
                • A 5-7% weekly ramp rate allows for sustainable progress
              </Text>
              <Text className="text-sm text-muted-foreground">
                • Include recovery weeks every 3-4 weeks to consolidate fitness
              </Text>
            </CardContent>
          </Card>

          {/* Warning for aggressive ramp rate */}
          {parseInt(rampRateText) > 10 && (
            <Card className="bg-amber-500/10 border-amber-500">
              <CardContent className="p-4 flex-row items-start gap-2">
                <Icon
                  as={AlertCircle}
                  size={20}
                  className="text-amber-500 mt-0.5"
                />
                <View className="flex-1">
                  <Text className="text-amber-500 font-semibold mb-1">
                    Warning: Very Aggressive Ramp Rate
                  </Text>
                  <Text className="text-amber-500 text-sm">
                    A ramp rate above 10% per week is very aggressive and
                    significantly increases injury risk. Most athletes should
                    aim for 5-7% per week.
                  </Text>
                </View>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Info card when disabled */}
      {!isEnabled && (
        <Card className="bg-muted/50">
          <CardContent className="p-4 gap-3">
            <Text className="font-semibold">What is Periodization?</Text>
            <Text className="text-sm text-muted-foreground">
              Periodization is a systematic approach to training that
              progressively builds your fitness (CTL) over time toward a
              specific goal or event. It helps you:
            </Text>
            <View className="gap-1 ml-2">
              <Text className="text-sm text-muted-foreground">
                • Peak at the right time
              </Text>
              <Text className="text-sm text-muted-foreground">
                • Avoid overtraining and burnout
              </Text>
              <Text className="text-sm text-muted-foreground">
                • Build fitness progressively and safely
              </Text>
              <Text className="text-sm text-muted-foreground">
                • Track progress toward your goals
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground mt-2">
              Enable periodization if you're training for a specific event or
              want structured fitness progression.
            </Text>
          </CardContent>
        </Card>
      )}
    </View>
  );
}
