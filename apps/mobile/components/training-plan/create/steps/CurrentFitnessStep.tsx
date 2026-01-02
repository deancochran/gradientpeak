import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Text } from "@/components/ui/text";
import { WizardStep } from "../WizardStep";
import { Activity, Clock, TrendingUp } from "lucide-react-native";
import React, { useState } from "react";
import { View, Pressable } from "react-native";
import type { WizardFitnessInput } from "@repo/core";
import {
  estimateCTLFromWeeklyHours,
  estimateCTLFromWeeklyTSS,
} from "@repo/core";

interface CurrentFitnessStepProps {
  fitness: WizardFitnessInput;
  onFitnessChange: (fitness: WizardFitnessInput) => void;
  onNext: () => void;
  onBack: () => void;
  currentStep: number;
  totalSteps: number;
  currentCTL?: number;
}

type FitnessInputMethod = "ctl" | "hours" | "tss";

export function CurrentFitnessStep({
  fitness,
  onFitnessChange,
  onNext,
  onBack,
  currentStep,
  totalSteps,
  currentCTL,
}: CurrentFitnessStepProps) {
  // Determine initial method based on what's set
  const getInitialMethod = (): FitnessInputMethod => {
    if (fitness.starting_ctl !== undefined && fitness.starting_ctl > 0)
      return "ctl";
    if (
      fitness.estimated_from_weekly_hours !== undefined &&
      fitness.estimated_from_weekly_hours > 0
    )
      return "hours";
    if (
      fitness.estimated_from_weekly_tss !== undefined &&
      fitness.estimated_from_weekly_tss > 0
    )
      return "tss";
    return currentCTL && currentCTL > 0 ? "ctl" : "hours";
  };

  const [method, setMethod] = useState<FitnessInputMethod>(getInitialMethod());

  // Calculate estimated CTL based on method
  const estimatedCTL = React.useMemo(() => {
    if (method === "ctl" && fitness.starting_ctl !== undefined) {
      return fitness.starting_ctl;
    }
    if (
      method === "hours" &&
      fitness.estimated_from_weekly_hours !== undefined
    ) {
      return estimateCTLFromWeeklyHours(fitness.estimated_from_weekly_hours);
    }
    if (method === "tss" && fitness.estimated_from_weekly_tss !== undefined) {
      return estimateCTLFromWeeklyTSS(fitness.estimated_from_weekly_tss);
    }
    return currentCTL || 0;
  }, [method, fitness, currentCTL]);

  const handleMethodChange = (newMethod: FitnessInputMethod) => {
    setMethod(newMethod);
    // Reset other values when changing method
    if (newMethod === "ctl") {
      onFitnessChange({
        starting_ctl: currentCTL || 40,
        estimated_from_weekly_hours: undefined,
        estimated_from_weekly_tss: undefined,
      });
    } else if (newMethod === "hours") {
      onFitnessChange({
        starting_ctl: undefined,
        estimated_from_weekly_hours: 5,
        estimated_from_weekly_tss: undefined,
      });
    } else {
      onFitnessChange({
        starting_ctl: undefined,
        estimated_from_weekly_hours: undefined,
        estimated_from_weekly_tss: 300,
      });
    }
  };

  const isValid = estimatedCTL > 0;

  return (
    <WizardStep
      currentStep={currentStep}
      totalSteps={totalSteps}
      title="What's your current fitness?"
      description="Help us understand where you're starting from"
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!isValid}
    >
      {/* Method Selector Tabs */}
      <View className="gap-2">
        <Label>How would you like to measure your fitness?</Label>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => handleMethodChange("ctl")}
            className={`flex-1 px-4 py-3 rounded-lg border ${
              method === "ctl"
                ? "bg-primary border-primary"
                : "bg-background border-border"
            }`}
          >
            <View className="items-center gap-1">
              <TrendingUp
                size={20}
                className={
                  method === "ctl"
                    ? "text-primary-foreground"
                    : "text-muted-foreground"
                }
              />
              <Text
                className={`text-sm font-medium ${
                  method === "ctl"
                    ? "text-primary-foreground"
                    : "text-foreground"
                }`}
              >
                CTL
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => handleMethodChange("hours")}
            className={`flex-1 px-4 py-3 rounded-lg border ${
              method === "hours"
                ? "bg-primary border-primary"
                : "bg-background border-border"
            }`}
          >
            <View className="items-center gap-1">
              <Clock
                size={20}
                className={
                  method === "hours"
                    ? "text-primary-foreground"
                    : "text-muted-foreground"
                }
              />
              <Text
                className={`text-sm font-medium ${
                  method === "hours"
                    ? "text-primary-foreground"
                    : "text-foreground"
                }`}
              >
                Hours
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => handleMethodChange("tss")}
            className={`flex-1 px-4 py-3 rounded-lg border ${
              method === "tss"
                ? "bg-primary border-primary"
                : "bg-background border-border"
            }`}
          >
            <View className="items-center gap-1">
              <Activity
                size={20}
                className={
                  method === "tss"
                    ? "text-primary-foreground"
                    : "text-muted-foreground"
                }
              />
              <Text
                className={`text-sm font-medium ${
                  method === "tss"
                    ? "text-primary-foreground"
                    : "text-foreground"
                }`}
              >
                TSS
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* CTL Method */}
      {method === "ctl" && (
        <Card>
          <CardHeader>
            <CardTitle>Chronic Training Load (CTL)</CardTitle>
            <CardDescription>
              Your 42-day fitness average.{" "}
              {currentCTL
                ? `Your current CTL is ${Math.round(currentCTL)}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <View className="gap-4">
              <View className="items-center">
                <Text className="text-4xl font-bold text-primary">
                  {Math.round(fitness.starting_ctl || 0)}
                </Text>
                <Text className="text-sm text-muted-foreground">CTL</Text>
              </View>

              <Slider
                value={fitness.starting_ctl || 0}
                onValueChange={(value) =>
                  onFitnessChange({ ...fitness, starting_ctl: value })
                }
                minimumValue={0}
                maximumValue={150}
                step={1}
                minimumTrackTintColor="#2563eb"
                maximumTrackTintColor="#e5e7eb"
              />

              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">
                  Beginner (0)
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Elite (150+)
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      )}

      {/* Weekly Hours Method */}
      {method === "hours" && (
        <Card>
          <CardHeader>
            <CardTitle>Weekly Training Hours</CardTitle>
            <CardDescription>
              How many hours per week do you currently train?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <View className="gap-4">
              <View className="items-center">
                <Text className="text-4xl font-bold text-primary">
                  {(fitness.estimated_from_weekly_hours || 0).toFixed(1)}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  hours/week
                </Text>
              </View>

              <Slider
                value={fitness.estimated_from_weekly_hours || 0}
                onValueChange={(value) =>
                  onFitnessChange({
                    ...fitness,
                    estimated_from_weekly_hours: value,
                  })
                }
                minimumValue={0}
                maximumValue={30}
                step={0.5}
                minimumTrackTintColor="#2563eb"
                maximumTrackTintColor="#e5e7eb"
              />

              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">0 hrs</Text>
                <Text className="text-xs text-muted-foreground">30 hrs</Text>
              </View>

              {fitness.estimated_from_weekly_hours !== undefined &&
                fitness.estimated_from_weekly_hours > 0 && (
                  <View className="bg-primary/10 rounded-lg p-3">
                    <Text className="text-sm text-muted-foreground text-center">
                      Estimated CTL:{" "}
                      <Text className="font-bold text-primary">
                        {Math.round(estimatedCTL)}
                      </Text>
                    </Text>
                  </View>
                )}
            </View>
          </CardContent>
        </Card>
      )}

      {/* Weekly TSS Method */}
      {method === "tss" && (
        <Card>
          <CardHeader>
            <CardTitle>Weekly Training Stress Score</CardTitle>
            <CardDescription>
              Your typical weekly TSS from all activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <View className="gap-4">
              <View className="items-center">
                <Text className="text-4xl font-bold text-primary">
                  {Math.round(fitness.estimated_from_weekly_tss || 0)}
                </Text>
                <Text className="text-sm text-muted-foreground">TSS/week</Text>
              </View>

              <Slider
                value={fitness.estimated_from_weekly_tss || 0}
                onValueChange={(value) =>
                  onFitnessChange({
                    ...fitness,
                    estimated_from_weekly_tss: value,
                  })
                }
                minimumValue={0}
                maximumValue={1000}
                step={10}
                minimumTrackTintColor="#2563eb"
                maximumTrackTintColor="#e5e7eb"
              />

              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">0 TSS</Text>
                <Text className="text-xs text-muted-foreground">1000 TSS</Text>
              </View>

              {fitness.estimated_from_weekly_tss !== undefined &&
                fitness.estimated_from_weekly_tss > 0 && (
                  <View className="bg-primary/10 rounded-lg p-3">
                    <Text className="text-sm text-muted-foreground text-center">
                      Estimated CTL:{" "}
                      <Text className="font-bold text-primary">
                        {Math.round(estimatedCTL)}
                      </Text>
                    </Text>
                  </View>
                )}
            </View>
          </CardContent>
        </Card>
      )}

      {/* Help Text */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <Text className="text-sm text-muted-foreground">
            {method === "ctl" &&
              "CTL (Chronic Training Load) is a 42-day weighted average of your training stress. Higher values indicate greater fitness."}
            {method === "hours" &&
              "We'll estimate your CTL based on typical training hours. This works well if you train consistently."}
            {method === "tss" &&
              "TSS (Training Stress Score) measures workout intensity and duration. We'll estimate your CTL from your weekly average."}
          </Text>
        </CardContent>
      </Card>
    </WizardStep>
  );
}
