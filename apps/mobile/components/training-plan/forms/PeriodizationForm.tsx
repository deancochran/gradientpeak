import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Card, CardContent } from "@repo/ui/components/card";
import { DateInput } from "@repo/ui/components/date-input";
import { Icon } from "@repo/ui/components/icon";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { AlertCircle, Lock, TrendingUp } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { parseDateKey, toDateKey } from "@/lib/calendar/dateMath";

interface PeriodizationTemplate {
  starting_longTermLoad: number;
  target_longTermLoad: number;
  ramp_rate: number;
  target_date: string;
}

interface PeriodizationFormProps {
  data: PeriodizationTemplate | null | undefined;
  onChange: (data: PeriodizationTemplate | null) => void;
  errors: Record<string, string>;
  currentLongTermLoad?: number | null;
}

export function PeriodizationForm({
  data,
  onChange,
  errors,
  currentLongTermLoad,
}: PeriodizationFormProps) {
  const [isEnabled, setIsEnabled] = React.useState(!!data);

  const startingLongTermLoad = currentLongTermLoad ?? 0;

  const [targetCtlText, setTargetCtlText] = React.useState(
    data?.target_longTermLoad?.toString() || "85",
  );
  const [rampRateText, setRampRateText] = React.useState(
    data?.ramp_rate ? (data.ramp_rate * 100).toFixed(0) : "5",
  );
  const [targetDate, setTargetDate] = React.useState<Date>(
    data?.target_date
      ? parseDateKey(data.target_date)
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  );

  // Calculate progression preview
  const progressionPreview = React.useMemo(() => {
    const startCtl = startingLongTermLoad;
    const targetCtl = parseInt(targetCtlText, 10) || 0;
    const rampRate = (parseInt(rampRateText, 10) || 5) / 100;

    const now = new Date();
    const daysToTarget = Math.floor((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
    };
  }, [startingLongTermLoad, targetCtlText, rampRateText, targetDate]);

  const handleToggle = (enabled: boolean) => {
    setIsEnabled(enabled);
    if (!enabled) {
      onChange(null);
    } else {
      onChange({
        starting_longTermLoad: startingLongTermLoad,
        target_longTermLoad: parseInt(targetCtlText, 10) || 85,
        ramp_rate: (parseInt(rampRateText, 10) || 5) / 100,
        target_date: toDateKey(targetDate),
      });
    }
  };

  const handleTargetCtlChange = (text: string) => {
    setTargetCtlText(text);
    const value = parseInt(text, 10);
    if (!Number.isNaN(value) && isEnabled) {
      onChange({
        starting_longTermLoad: startingLongTermLoad,
        target_longTermLoad: value,
        ramp_rate: (parseInt(rampRateText, 10) || 5) / 100,
        target_date: toDateKey(targetDate),
      });
    }
  };

  const handleRampRateChange = (text: string) => {
    setRampRateText(text);
    const value = parseInt(text, 10);
    if (!Number.isNaN(value) && isEnabled) {
      onChange({
        starting_longTermLoad: startingLongTermLoad,
        target_longTermLoad: parseInt(targetCtlText, 10) || 85,
        ramp_rate: value / 100,
        target_date: toDateKey(targetDate),
      });
    }
  };

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="text-2xl font-bold">Periodization Planning</Text>
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="font-semibold">Enable periodization</Text>
        <Switch checked={isEnabled} onCheckedChange={handleToggle} />
      </View>

      {/* Periodization Form (only shown when enabled) */}
      {isEnabled && (
        <>
          {/* Current Fitness (Read-Only) */}
          <View className="gap-3">
            <Label className="text-base font-semibold">Current Load History</Label>
            <Card className="bg-muted/50 border-muted">
              <CardContent className="p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Icon as={Lock} size={16} className="text-muted-foreground" />
                      <Text className="text-sm text-muted-foreground font-medium">
                        Starting Long-term Load
                      </Text>
                    </View>
                    <Text className="text-3xl font-bold text-foreground">
                      {startingLongTermLoad} Long-term Load
                    </Text>
                    {startingLongTermLoad === 0 ? (
                      <Text className="text-xs text-muted-foreground mt-2">
                        Long-term Load will update as you sync activities from connected services
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

          {/* Target Long-term Load */}
          <View className="gap-3">
            <Label className="text-base font-semibold">Target Long-term Load</Label>
            <IntegerStepper
              id="periodization-target-ctl"
              value={parseInt(targetCtlText, 10) || 85}
              min={0}
              max={250}
              onChange={(nextCtl) => handleTargetCtlChange(String(nextCtl))}
              helperText=""
              {...(errors.target_longTermLoad === undefined
                ? {}
                : { error: errors.target_longTermLoad })}
            />
          </View>

          {/* Ramp Rate */}
          <View className="gap-3">
            <Label className="text-base font-semibold">Weekly Ramp Rate (%)</Label>
            <IntegerStepper
              id="periodization-ramp-rate"
              value={parseInt(rampRateText, 10) || 5}
              min={1}
              max={20}
              onChange={(nextRate) => handleRampRateChange(String(nextRate))}
              helperText=""
              {...(errors.ramp_rate === undefined ? {} : { error: errors.ramp_rate })}
            />
          </View>

          {/* Target Date */}
          <View className="gap-3">
            <Label className="text-base font-semibold">Target Date</Label>
            <DateInput
              accessibilityHint="Choose the goal date for this target"
              id="periodization-target-date"
              label=""
              minimumDate={new Date()}
              onChange={(value) => {
                if (!value) {
                  return;
                }

                const selectedDate = parseDateKey(value);
                setTargetDate(selectedDate);
                if (isEnabled) {
                  onChange({
                    starting_longTermLoad: startingLongTermLoad,
                    target_longTermLoad: parseInt(targetCtlText, 10) || 85,
                    ramp_rate: (parseInt(rampRateText, 10) || 5) / 100,
                    target_date: value,
                  });
                }
              }}
              pickerPresentation="modal"
              value={toDateKey(targetDate)}
            />
            {errors.target_date && (
              <Text className="text-destructive text-xs">{errors.target_date}</Text>
            )}
          </View>

          {/* Progression Preview */}
          {startingLongTermLoad > 0 &&
            parseInt(targetCtlText, 10) > 0 &&
            parseInt(rampRateText, 10) > 0 && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 gap-3">
                  <View className="flex-row items-center gap-2">
                    <Icon as={TrendingUp} size={20} className="text-primary" />
                    <Text className="font-semibold text-primary">Progression Preview</Text>
                  </View>

                  <View className="gap-2">
                    <View className="flex-row justify-between">
                      <Text className="text-muted-foreground">Long-term Load increase:</Text>
                      <Text className="font-semibold">
                        +{progressionPreview.ctlIncrease} ({startingLongTermLoad} → {targetCtlText})
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-muted-foreground">Time to target:</Text>
                      <Text className="font-semibold">
                        {progressionPreview.weeksToTarget} weeks ({progressionPreview.daysToTarget}{" "}
                        days)
                      </Text>
                    </View>
                  </View>
                  {!progressionPreview.achievable ? (
                    <View className="flex-row items-center gap-2 bg-destructive/10 p-2 rounded-md mt-2">
                      <Icon as={AlertCircle} size={16} className="text-destructive" />
                      <Text className="text-destructive text-sm font-medium">
                        Goal may not be achievable - need {progressionPreview.weeksNeeded} weeks but
                        only have {progressionPreview.weeksToTarget}
                      </Text>
                    </View>
                  ) : null}
                </CardContent>
              </Card>
            )}

          {/* Warning for aggressive ramp rate */}
          {parseInt(rampRateText, 10) > 10 && (
            <Alert icon={AlertCircle} iconClassName="text-amber-500">
              <AlertTitle className="text-amber-500">Large Weekly Long-term Load Change</AlertTitle>
              <AlertDescription className="text-amber-500">
                This setting projects a Long-term Load increase above 10% per week. Review the
                resulting values and date before saving.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </View>
  );
}
