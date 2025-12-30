import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { convertUIToV2Duration } from "@/lib/utils/durationConversion";
import type {
  IntensityTargetV2,
  IntervalV2,
  IntervalStepV2,
} from "@repo/core/schemas/activity_plan_v2";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Dimensions, ScrollView, View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";

interface IntervalWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (interval: IntervalV2) => void;
  defaultSegmentName?: string;
}

interface IntervalConfig {
  segmentName: string;
  repeatCount: number;
  workName: string;
  workDuration: number;
  workUnit: "seconds" | "minutes";
  workIntensity: number;
  restName: string;
  restDuration: number;
  restUnit: "seconds" | "minutes";
  restIntensity: number;
}

export function IntervalWizard({
  open,
  onOpenChange,
  onSave,
  defaultSegmentName,
}: IntervalWizardProps) {
  const [config, setConfig] = useState<IntervalConfig>({
    segmentName: defaultSegmentName || "Intervals",
    repeatCount: 5,
    workName: "Work",
    workDuration: 2,
    workUnit: "minutes",
    workIntensity: 95,
    restName: "Rest",
    restDuration: 1,
    restUnit: "minutes",
    restIntensity: 50,
  });

  useEffect(() => {
    if (open && defaultSegmentName) {
      setConfig((prev) => ({ ...prev, segmentName: defaultSegmentName }));
    }
  }, [open, defaultSegmentName]);

  const workDurationSeconds =
    config.workUnit === "minutes"
      ? config.workDuration * 60
      : config.workDuration;
  const restDurationSeconds =
    config.restUnit === "minutes"
      ? config.restDuration * 60
      : config.restDuration;

  const intervalDuration = workDurationSeconds + restDurationSeconds;
  const totalDuration = intervalDuration * config.repeatCount;
  const totalSteps = config.repeatCount * 2;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    return `${secs}s`;
  };

  const handleSave = () => {
    const steps: IntervalStepV2[] = [];

    // Work step
    steps.push({
      id: require("expo-crypto").randomUUID(),
      name: config.workName,
      duration: convertUIToV2Duration({
        type: "time",
        value: config.workDuration,
        unit: config.workUnit,
      }),
      targets: [
        {
          type: "%FTP",
          intensity: config.workIntensity,
        } as IntensityTargetV2,
      ],
    });

    // Rest step
    steps.push({
      id: require("expo-crypto").randomUUID(),
      name: config.restName,
      duration: convertUIToV2Duration({
        type: "time",
        value: config.restDuration,
        unit: config.restUnit,
      }),
      targets: [
        {
          type: "%FTP",
          intensity: config.restIntensity,
        } as IntensityTargetV2,
      ],
    });

    const interval: IntervalV2 = {
      id: require("expo-crypto").randomUUID(),
      name: config.segmentName,
      repetitions: config.repeatCount,
      steps: steps,
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(interval);
    onOpenChange(false);
  };

  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
  const dialogWidth = Math.min(screenWidth * 0.95, 450);
  const dialogHeight = Math.min(screenHeight * 0.9, screenHeight - 80);

  // SVG Preview dimensions
  const previewWidth = dialogWidth - 80;
  const previewHeight = 100;
  const barHeight = 40;

  // Calculate bar widths proportionally
  const workPercent = workDurationSeconds / intervalDuration;
  const restPercent = restDurationSeconds / intervalDuration;

  const getIntensityColor = (intensity: number): string => {
    if (intensity >= 106) return "#dc2626"; // Z5 - Red
    if (intensity >= 91) return "#ea580c"; // Z4 - Orange
    if (intensity >= 76) return "#ca8a04"; // Z3 - Yellow
    if (intensity >= 56) return "#16a34a"; // Z2 - Green
    return "#06b6d4"; // Z1 - Light Blue
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          width: dialogWidth,
          height: dialogHeight,
          margin: 20,
        }}
        className="bg-background border border-border shadow-xl"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between p-4 border-b">
          <Text className="text-lg font-medium flex-1 text-center">
            Create Intervals
          </Text>
          <Button onPress={handleSave} size="sm">
            <Text className="text-primary-foreground">Create</Text>
          </Button>
        </View>

        <View className="flex-1">
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <View className="gap-4 p-4">
              {/* Segment Name */}
              <View>
                <Label>Segment Name</Label>
                <Input
                  value={config.segmentName}
                  onChangeText={(text) =>
                    setConfig({ ...config, segmentName: text })
                  }
                  placeholder="e.g., Intervals, Main Set"
                />
              </View>

              {/* Repeat Count */}
              <View>
                <Label>Number of Repeats</Label>
                <Input
                  value={config.repeatCount.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 0;
                    setConfig({ ...config, repeatCount: Math.max(1, num) });
                  }}
                  keyboardType="numeric"
                  placeholder="5"
                />
              </View>

              {/* Work Section */}
              <View className="border border-border rounded-lg p-4 bg-muted/30">
                <Text className="text-base font-semibold mb-3">Work Phase</Text>

                <View className="gap-3">
                  <View>
                    <Label>Work Name</Label>
                    <Input
                      value={config.workName}
                      onChangeText={(text) =>
                        setConfig({ ...config, workName: text })
                      }
                      placeholder="Work"
                    />
                  </View>

                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Label>Duration</Label>
                      <Input
                        value={config.workDuration.toString()}
                        onChangeText={(text) => {
                          const num = parseFloat(text) || 0;
                          setConfig({ ...config, workDuration: num });
                        }}
                        keyboardType="numeric"
                        placeholder="2"
                      />
                    </View>
                    <View className="w-28">
                      <Label>Unit</Label>
                      <View className="flex-row gap-1">
                        <Button
                          variant={
                            config.workUnit === "seconds"
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onPress={() =>
                            setConfig({ ...config, workUnit: "seconds" })
                          }
                          className="flex-1"
                        >
                          <Text
                            className={
                              config.workUnit === "seconds"
                                ? "text-primary-foreground text-xs"
                                : "text-xs"
                            }
                          >
                            sec
                          </Text>
                        </Button>
                        <Button
                          variant={
                            config.workUnit === "minutes"
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onPress={() =>
                            setConfig({ ...config, workUnit: "minutes" })
                          }
                          className="flex-1"
                        >
                          <Text
                            className={
                              config.workUnit === "minutes"
                                ? "text-primary-foreground text-xs"
                                : "text-xs"
                            }
                          >
                            min
                          </Text>
                        </Button>
                      </View>
                    </View>
                  </View>

                  <View>
                    <Label>Intensity (% FTP)</Label>
                    <Input
                      value={config.workIntensity.toString()}
                      onChangeText={(text) => {
                        const num = parseInt(text) || 0;
                        setConfig({ ...config, workIntensity: num });
                      }}
                      keyboardType="numeric"
                      placeholder="95"
                    />
                  </View>
                </View>
              </View>

              {/* Rest Section */}
              <View className="border border-border rounded-lg p-4 bg-muted/30">
                <Text className="text-base font-semibold mb-3">Rest Phase</Text>

                <View className="gap-3">
                  <View>
                    <Label>Rest Name</Label>
                    <Input
                      value={config.restName}
                      onChangeText={(text) =>
                        setConfig({ ...config, restName: text })
                      }
                      placeholder="Rest"
                    />
                  </View>

                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Label>Duration</Label>
                      <Input
                        value={config.restDuration.toString()}
                        onChangeText={(text) => {
                          const num = parseFloat(text) || 0;
                          setConfig({ ...config, restDuration: num });
                        }}
                        keyboardType="numeric"
                        placeholder="1"
                      />
                    </View>
                    <View className="w-28">
                      <Label>Unit</Label>
                      <View className="flex-row gap-1">
                        <Button
                          variant={
                            config.restUnit === "seconds"
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onPress={() =>
                            setConfig({ ...config, restUnit: "seconds" })
                          }
                          className="flex-1"
                        >
                          <Text
                            className={
                              config.restUnit === "seconds"
                                ? "text-primary-foreground text-xs"
                                : "text-xs"
                            }
                          >
                            sec
                          </Text>
                        </Button>
                        <Button
                          variant={
                            config.restUnit === "minutes"
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onPress={() =>
                            setConfig({ ...config, restUnit: "minutes" })
                          }
                          className="flex-1"
                        >
                          <Text
                            className={
                              config.restUnit === "minutes"
                                ? "text-primary-foreground text-xs"
                                : "text-xs"
                            }
                          >
                            min
                          </Text>
                        </Button>
                      </View>
                    </View>
                  </View>

                  <View>
                    <Label>Intensity (% FTP)</Label>
                    <Input
                      value={config.restIntensity.toString()}
                      onChangeText={(text) => {
                        const num = parseInt(text) || 0;
                        setConfig({ ...config, restIntensity: num });
                      }}
                      keyboardType="numeric"
                      placeholder="50"
                    />
                  </View>
                </View>
              </View>

              {/* Preview */}
              <View className="border border-border rounded-lg p-4 bg-background">
                <Text className="text-base font-semibold mb-3">Preview</Text>

                {/* Summary Stats */}
                <View className="flex-row justify-between mb-4">
                  <View>
                    <Text className="text-xs text-muted-foreground">
                      Total Steps
                    </Text>
                    <Text className="text-lg font-semibold">{totalSteps}</Text>
                  </View>
                  <View>
                    <Text className="text-xs text-muted-foreground">
                      Interval Duration
                    </Text>
                    <Text className="text-lg font-semibold">
                      {formatTime(intervalDuration)}
                    </Text>
                  </View>
                  <View>
                    <Text className="text-xs text-muted-foreground">
                      Total Duration
                    </Text>
                    <Text className="text-lg font-semibold">
                      {formatTime(totalDuration)}
                    </Text>
                  </View>
                </View>

                {/* SVG Visual Preview */}
                <View>
                  <Text className="text-xs text-muted-foreground mb-2">
                    Interval Pattern
                  </Text>
                  <Svg width={previewWidth} height={previewHeight}>
                    {/* Single interval visualization */}
                    <Rect
                      x="0"
                      y={(previewHeight - barHeight) / 2}
                      width={previewWidth * workPercent}
                      height={barHeight}
                      fill={getIntensityColor(config.workIntensity)}
                      rx="4"
                    />
                    <SvgText
                      x={(previewWidth * workPercent) / 2}
                      y={previewHeight / 2}
                      fontSize="12"
                      fill="white"
                      textAnchor="middle"
                      alignmentBaseline="middle"
                      fontWeight="600"
                    >
                      {config.workName}
                    </SvgText>

                    <Rect
                      x={previewWidth * workPercent}
                      y={(previewHeight - barHeight) / 2}
                      width={previewWidth * restPercent}
                      height={barHeight}
                      fill={getIntensityColor(config.restIntensity)}
                      rx="4"
                    />
                    <SvgText
                      x={
                        previewWidth * workPercent +
                        (previewWidth * restPercent) / 2
                      }
                      y={previewHeight / 2}
                      fontSize="12"
                      fill="white"
                      textAnchor="middle"
                      alignmentBaseline="middle"
                      fontWeight="600"
                    >
                      {config.restName}
                    </SvgText>
                  </Svg>

                  <Text className="text-xs text-muted-foreground text-center mt-2">
                    This pattern will repeat {config.repeatCount} time
                    {config.repeatCount !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </DialogContent>
    </Dialog>
  );
}
