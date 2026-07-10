import { Text } from "@repo/ui/components/text";
import { Activity, ChevronDown, ChevronUp, Sprout, Trophy } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { WizardStep } from "../WizardStep";

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
      "Ready for structured activities",
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
              accessibilityLabel={`${level.label}: ${level.description}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              key={level.value}
              onPress={() => onExperienceLevelChange(level.value)}
              className={`rounded-lg border px-3 py-2.5 active:opacity-80 ${
                isSelected ? "border-primary bg-primary/5" : "border-border bg-background"
              }`}
            >
              <View className="flex-row items-start gap-3">
                <View className="pt-0.5">
                  <IconComponent
                    size={20}
                    className={isSelected ? "text-primary" : "text-muted-foreground"}
                  />
                </View>

                <View className="flex-1">
                  <Text
                    className={`text-base font-semibold ${
                      isSelected ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {level.label}
                  </Text>
                  <Text className="text-sm text-muted-foreground">{level.description}</Text>

                  <View className="mt-1.5 gap-0.5">
                    {level.bullets.map((bullet) => (
                      <View key={bullet} className="flex-row items-start gap-2">
                        <Text className="text-primary text-xs mt-0.5">●</Text>
                        <Text className="text-xs text-muted-foreground flex-1">{bullet}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {isSelected && <Text className="text-sm font-semibold text-primary">Selected</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Advanced: Intensity Preset */}
      <View className="rounded-lg border border-border">
        <Pressable
          accessibilityLabel="Intensity distribution options"
          accessibilityRole="button"
          accessibilityState={{ expanded: showIntensityOptions }}
          onPress={() => setShowIntensityOptions(!showIntensityOptions)}
          className="px-3 py-2.5 active:bg-accent"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">
                Intensity distribution
              </Text>
              <Text className="text-sm text-muted-foreground">
                {INTENSITY_PRESETS.find((p) => p.value === intensityPreset)?.label || "Pyramidal"} ·{" "}
                {INTENSITY_PRESETS.find((p) => p.value === intensityPreset)?.description ||
                  "Default"}
              </Text>
            </View>
            {showIntensityOptions ? (
              <ChevronUp size={20} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={20} className="text-muted-foreground" />
            )}
          </View>
        </Pressable>

        {showIntensityOptions && (
          <View className="gap-3 border-t border-border px-3 py-3">
            <View>
              <Text className="text-sm text-muted-foreground">
                Choose how your training intensity will be distributed. Most athletes do well with
                Pyramidal.
              </Text>
            </View>

            <View className="gap-2">
              {INTENSITY_PRESETS.map((preset) => {
                const isSelected = intensityPreset === preset.value;

                return (
                  <Pressable
                    accessibilityLabel={`${preset.label}: ${preset.description}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    key={preset.value}
                    onPress={() => onIntensityPresetChange(preset.value)}
                    className={`rounded-md border px-3 py-2 ${
                      isSelected ? "border-primary bg-primary/10" : "border-border bg-background"
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
                      <Text className="text-xs text-muted-foreground">{preset.description}</Text>
                    </View>
                    <Text className="text-sm text-muted-foreground">{preset.detail}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      <View className="rounded-lg bg-muted/30 px-3 py-2.5">
        <Text className="text-sm text-muted-foreground">
          Your experience level helps determine appropriate volume, intensity progression, and
          recovery needs. You can adjust your plan later.
        </Text>
      </View>
    </WizardStep>
  );
}
