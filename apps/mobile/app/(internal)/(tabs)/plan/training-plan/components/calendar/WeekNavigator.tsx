import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { View } from "react-native";

interface WeekNavigatorProps {
  weekNumber: number;
  weekDateRange: string;
  isCurrentWeek: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onCurrentWeek: () => void;
}

/**
 * Week navigation component for training plan calendar
 * Shows current week with previous/next navigation and jump to current week
 */
export function WeekNavigator({
  weekNumber,
  weekDateRange,
  isCurrentWeek,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
}: WeekNavigatorProps) {
  return (
    <View className="bg-card rounded-lg p-4 mb-4">
      <View className="flex-row items-center justify-between">
        {/* Previous Week Button */}
        <Button
          variant="ghost"
          size="icon"
          onPress={onPreviousWeek}
          className="rounded-full"
        >
          <Icon as={ChevronLeft} size={24} className="text-foreground" />
        </Button>

        {/* Week Display */}
        <View className="flex-1 items-center">
          <Text className="text-lg font-bold">
            Week {weekNumber}
          </Text>
          <Text className="text-sm text-muted-foreground mt-1">
            {weekDateRange}
          </Text>

          {/* Current Week Indicator */}
          {isCurrentWeek && (
            <View className="bg-primary/10 rounded-full px-3 py-1 mt-2">
              <Text className="text-xs text-primary font-medium">
                Current Week
              </Text>
            </View>
          )}
        </View>

        {/* Next Week Button */}
        <Button
          variant="ghost"
          size="icon"
          onPress={onNextWeek}
          className="rounded-full"
        >
          <Icon as={ChevronRight} size={24} className="text-foreground" />
        </Button>
      </View>

      {/* Jump to Current Week Button (only show when not on current week) */}
      {!isCurrentWeek && (
        <View className="mt-3 pt-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onPress={onCurrentWeek}
            className="w-full"
          >
            <Text className="text-foreground font-medium">
              Jump to Current Week
            </Text>
          </Button>
        </View>
      )}
    </View>
  );
}
