import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { WizardStep } from "../WizardStep";
import { Sprout, Activity, Trophy, ChevronDown, ChevronUp } from "lucide-react-native";
import React, { useState } from "react";
import { View, Pressable } from "react-native";

interface ExperienceLevelStepProps {
  experienceLevel: "beginner" | "intermediate" | "advanced";
  intensityPreset: "polarized" | "pyramidal" | "threshold";
  onExperienceLevelChange: (level: "beginner" | "intermediate" | "advanced") => void;
  onIntensityPresetChange: (preset: "polarized" | "pyramidal" | "threshold") => void;
  onNext: () => void;
  onBack: () => void;
  currentStep: number;
  totalSteps: number;
}

const EXPERIENCE_LEVELS = [
  {
    value: "beginner" as const,
    label: "Beginner",
    icon: Sprout,
    description: "New to structured training or returning after a long break",
    bullets: [
      "Building base fitness",
      "Learning proper technique",
      "Gradual progression",
      "Focus on consistency",
    ],
  },
  {
    value: "intermediate" as const,
    label: "Intermediate",
    icon: Activity,
    description: "Comfortable with regular training and ready to level up",
    bullets: [
      "Established training routine",
      "Some race experience",
      "Ready for structured workouts",
      "Focus on performance gains",
    ],
  },
  {
    value: "advanced" as const,
    label: "Advanced",
    icon: Trophy,
    description: "Experienced athlete with specific performance goals",
    bullets: [
      "Years of consistent training",
      "Strong base fitness",
      "High training volume tolerance",
      "Focus on optimization",
    ],
  },
];

const INTENSITY_PRESETS = [
  {
    value: "polarized" as const,
    label: "Polarized",
    description: "80% easy, 20% hard",
    detail:
      "Emphasizes very easy aerobic work with occasional high-intensity sessions. Great for building endurance efficiently.",
  },
  {
    value: "pyramidal" as const,
    label: "Pyramidal",
    description: "70% easy, 20% moderate, 10% hard",
    detail:
      "Balanced approach with a foundation of easy work, some tempo efforts, and limited high intensity. Most versatile.",
  },
  {
    value: "threshold" as const,
    label: "Threshold",
    description: "60% easy, 30% moderate, 10% hard",
    detail:
      "More time at lactate threshold. Good for time-crunched athletes or those focused on shorter events.",
  },
];

export function ExperienceLevelStep({
  experienceLevel,
  intensityPreset,
  onExperienceLevelChange,
  onIntensityPresetChange,
  onNext,
  onBack,
  currentStep,
  totalSteps,
}: ExperienceLevelStepProps) {
  const [showIntensityOptions, setShowIntensityOptions] = useState(false);

  return (
    <WizardStep
      currentStep={currentStep}
      totalSteps={totalSteps}
      title="What's your experience level?"
      description="This helps us set the right intensity and progression"
      onBack={onBack}
      onNext={onNext}
    >
      {/* Experience Level Selection */}
      <View className="gap-3">
        {EXPERIENCE_LEVELS.map((level) => {
          const IconComponent = level.icon;
          const isSelected = experienceLevel === level.value;

          return (
            <Pressable
              key={level.value}
              onPress={() => onExperienceLevelChange(level.value)}
              className={`rounded-xl border p-4 active:opacity-80 ${
                isSelected
                  ? "bg-primary/5 border-primary"
                  : "bg-card border-border"
              }`}
            >
              <View className="flex-row items-start gap-3">
                {/* Icon */}
                <View
                  className={`p-3 rounded-full ${
                    isSelected ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <IconComponent
                    size={24}
                    className={
                      isSelected
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    }
                  />
                </View>

                {/* Content */}
                <View className="flex-1">
                  <Text
                    className={`text-lg font-semibold mb-1 ${
                      isSelected ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {level.label}
                  </Text>
                  <Text className="text-sm text-muted-foreground mb-2">
                    {level.description}
                  </Text>

                  {/* Bullets */}
                  <View className="gap-1">
                    {level.bullets.map((bullet, idx) => (
                      <View key={idx} className="flex-row items-start gap-2">
                        <Text className="text-primary text-xs mt-0.5">●</Text>
                        <Text className="text-xs text-muted-foreground flex-1">
                          {bullet}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Selection Indicator */}
                {isSelected && (
                  <View className="bg-primary rounded-full w-6 h-6 items-center justify-center">
                    <Text className="text-primary-foreground text-xs font-bold">
                      ✓
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Advanced: Intensity Preset */}
      <Card>
        <Pressable
          onPress={() => setShowIntensityOptions(!showIntensityOptions)}
          className="active:bg-accent"
        >
          <CardHeader>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <CardTitle className="text-base">
                  Intensity Distribution
                </CardTitle>
                <CardDescription>
                  {INTENSITY_PRESETS.find((p) => p.value === intensityPreset)
                    ?.label || "Pyramidal"}{" "}
                  (
                  {INTENSITY_PRESETS.find((p) => p.value === intensityPreset)
                    ?.description || "Default"}
                  )
                </CardDescription>
              </View>
              {showIntensityOptions ? (
                <ChevronUp size={20} className="text-muted-foreground" />
              ) : (
                <ChevronDown size={20} className="text-muted-foreground" />
              )}
            </View>
          </CardHeader>
        </Pressable>

        {showIntensityOptions && (
          <CardContent>
            <View className="gap-2 mb-3">
              <Text className="text-sm text-muted-foreground">
                Choose how your training intensity will be distributed. Most
                athletes do well with Pyramidal.
              </Text>
            </View>

            <View className="gap-2">
              {INTENSITY_PRESETS.map((preset) => {
                const isSelected = intensityPreset === preset.value;

                return (
                  <Pressable
                    key={preset.value}
                    onPress={() => onIntensityPresetChange(preset.value)}
                    className={`p-3 rounded-lg border ${
                      isSelected
                        ? "bg-primary/10 border-primary"
                        : "bg-background border-border"
                    }`}
                  >
                    <View className="flex-row items-center justify-between mb-1">
                      <Text
                        className={`font-semibold ${
                          isSelected ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {preset.label}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {preset.description}
                      </Text>
                    </View>
                    <Text className="text-sm text-muted-foreground">
                      {preset.detail}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </CardContent>
        )}
      </Card>

      {/* Helpful Info */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <Text className="text-sm text-muted-foreground">
            💡 Your experience level helps us determine appropriate training
            volume, intensity progression, and recovery needs. You can always
            adjust your plan later.
          </Text>
        </CardContent>
      </Card>
    </WizardStep>
  );
}
