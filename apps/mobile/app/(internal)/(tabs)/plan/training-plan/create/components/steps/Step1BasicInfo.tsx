import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { View } from "react-native";

interface Step1BasicInfoProps {
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  errors?: {
    name?: string;
    description?: string;
  };
}

/**
 * Step 1: Basic Information
 * Collects plan name and description
 */
export function Step1BasicInfo({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  errors,
}: Step1BasicInfoProps) {
  return (
    <View className="gap-6">
      {/* Introduction */}
      <View className="bg-muted/30 rounded-lg p-4">
        <Text className="text-sm text-muted-foreground leading-6">
          Create a personalized training plan to help you reach your fitness
          goals. Give your plan a memorable name and optional description.
        </Text>
      </View>

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
        <Text className="text-xs text-muted-foreground">
          {name.length}/100 characters
        </Text>
      </View>

      {/* Description */}
      <View className="gap-2">
        <Label nativeID="plan-description">
          <Text className="text-base font-semibold">
            Description (Optional)
          </Text>
        </Label>
        <Input
          aria-labelledby="plan-description"
          placeholder="Describe your training goals..."
          value={description}
          onChangeText={onDescriptionChange}
          multiline
          numberOfLines={4}
          maxLength={500}
          style={{ minHeight: 100 }}
        />
        {errors?.description && (
          <Text className="text-sm text-destructive">{errors.description}</Text>
        )}
        <Text className="text-xs text-muted-foreground">
          {description.length}/500 characters
        </Text>
      </View>

      {/* Tips */}
      <View className="bg-blue-500/10 rounded-lg p-4">
        <Text className="text-sm font-semibold text-blue-600 mb-2">
          💡 Tips
        </Text>
        <Text className="text-sm text-muted-foreground leading-5">
          • Choose a name that reflects your goal (e.g., Base Building, Race
          Prep)
          {"\n"}• Include the season or target event in the description
          {"\n"}• You can always edit these details later
        </Text>
      </View>
    </View>
  );
}
