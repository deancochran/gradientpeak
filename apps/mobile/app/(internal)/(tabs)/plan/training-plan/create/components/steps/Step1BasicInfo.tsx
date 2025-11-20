import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Pressable, View } from "react-native";

export type PlanPreset = "beginner" | "intermediate" | "advanced" | "custom";

interface Step1BasicInfoProps {
  name: string;
  description: string;
  preset: PlanPreset;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPresetChange: (preset: PlanPreset) => void;
  errors?: {
    name?: string;
    description?: string;
  };
}

const PRESET_OPTIONS: Array<{
  value: PlanPreset;
  label: string;
  description: string;
  emoji: string;
}> = [
  {
    value: "beginner",
    label: "Beginner",
    description: "3 days/week, easier pace",
    emoji: "🌱",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    description: "4 days/week, balanced",
    emoji: "🏃",
  },
  {
    value: "advanced",
    label: "Advanced",
    description: "5+ days/week, high volume",
    emoji: "🚀",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Set your own targets",
    emoji: "⚙️",
  },
];

/**
 * Step 1: Basic Information + Preset Selection
 * Streamlined to collect name, optional description, and training level preset
 */
export function Step1BasicInfo({
  name,
  description,
  preset,
  onNameChange,
  onDescriptionChange,
  onPresetChange,
  errors,
}: Step1BasicInfoProps) {
  return (
    <View className="gap-6">
      {/* Plan Name */}
      <View className="gap-2">
        <Label nativeID="plan-name">
          <Text className="text-base font-semibold">
            Plan Name <Text className="text-destructive">*</Text>
          </Text>
        </Label>
        <Input
          aria-labelledby="plan-name"
          placeholder="e.g., Marathon Prep 2024"
          value={name}
          onChangeText={onNameChange}
          autoFocus
          maxLength={100}
        />
        {errors?.name && (
          <Text className="text-sm text-destructive">{errors.name}</Text>
        )}
      </View>

      {/* Description */}
      <View className="gap-2">
        <Label nativeID="plan-description">
          <Text className="text-base font-semibold">
            Description{" "}
            <Text className="text-xs text-muted-foreground">(Optional)</Text>
          </Text>
        </Label>
        <Input
          aria-labelledby="plan-description"
          placeholder="Brief description of your training goal..."
          value={description}
          onChangeText={onDescriptionChange}
          multiline
          numberOfLines={2}
          maxLength={500}
          style={{ minHeight: 60 }}
        />
      </View>

      {/* Preset Selection */}
      <View className="gap-3">
        <Label nativeID="training-level">
          <Text className="text-base font-semibold">Training Level</Text>
        </Label>
        <Text className="text-sm text-muted-foreground -mt-1">
          Choose a starting point (you can customize in the next step)
        </Text>

        <View className="gap-2">
          {PRESET_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => onPresetChange(option.value)}
              className={`border-2 rounded-lg p-4 ${
                preset === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card"
              }`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1">
                  <Text className="text-2xl">{option.emoji}</Text>
                  <View className="flex-1">
                    <Text
                      className={`text-base font-semibold ${
                        preset === option.value
                          ? "text-primary"
                          : "text-foreground"
                      }`}
                    >
                      {option.label}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {option.description}
                    </Text>
                  </View>
                </View>
                {preset === option.value && (
                  <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                    <Text className="text-primary-foreground text-xs font-bold">
                      ✓
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Quick tip */}
      <View className="bg-muted/30 rounded-lg p-3">
        <Text className="text-xs text-muted-foreground leading-5">
          💡 Don't worry about getting it perfect—you can fine-tune all settings
          in the next step and adjust anytime after creating the plan.
        </Text>
      </View>
    </View>
  );
}
