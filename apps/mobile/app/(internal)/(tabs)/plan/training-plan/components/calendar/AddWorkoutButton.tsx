import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Plus } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface AddWorkoutButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

/**
 * Floating action button for adding workouts to the calendar
 * Positioned at the bottom-right of the screen
 */
export function AddWorkoutButton({
  onPress,
  disabled = false,
}: AddWorkoutButtonProps) {
  return (
    <View className="absolute bottom-6 right-6 z-10">
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <View
          className={`flex-row items-center gap-2 rounded-full px-6 py-4 shadow-lg ${
            disabled ? "bg-muted" : "bg-primary"
          }`}
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Icon
            as={Plus}
            size={24}
            className={disabled ? "text-muted-foreground" : "text-primary-foreground"}
          />
          <Text
            className={`font-semibold ${
              disabled ? "text-muted-foreground" : "text-primary-foreground"
            }`}
          >
            Add Workout
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
