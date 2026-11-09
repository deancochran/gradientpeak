import { getActivityDisplayName, type RecordingActivityCategory } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  type LucideIcon,
  Waves,
  X,
} from "lucide-react-native";
import { memo } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

interface RecordingActivityQuickEditProps {
  visible: boolean;
  onClose: () => void;
  onActivitySelect: (category: RecordingActivityCategory) => void;
  currentCategory: RecordingActivityCategory;
  canEditActivity: boolean;
}

const QUICK_ACTIVITIES: Array<{
  category: RecordingActivityCategory;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}> = [
  { category: "run", icon: Footprints, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { category: "bike", icon: Bike, color: "text-blue-600", bgColor: "bg-blue-50" },
  { category: "swim", icon: Waves, color: "text-cyan-600", bgColor: "bg-cyan-50" },
  { category: "strength", icon: Dumbbell, color: "text-red-600", bgColor: "bg-red-50" },
  { category: "other", icon: Activity, color: "text-gray-600", bgColor: "bg-gray-50" },
];

export const RecordingActivityQuickEdit = memo(function RecordingActivityQuickEdit({
  visible,
  onClose,
  onActivitySelect,
  currentCategory,
  canEditActivity,
}: RecordingActivityQuickEditProps) {
  if (!visible) return null;

  const handleCategorySelect = (category: RecordingActivityCategory) => {
    if (!canEditActivity) return;
    onClose();
    onActivitySelect(category);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/50">
        <Pressable
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="flex-1"
          onPress={onClose}
        />
        <View className="rounded-t-3xl bg-background pb-8" testID="recording-activity-quick-edit">
          <View className="flex-row items-center justify-between border-b border-border px-6 pb-4 pt-6">
            <View className="flex-1 pr-4">
              <Text className="text-2xl font-bold">Activity</Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                Choose the activity category for this recording session.
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close activity quick edit"
              accessibilityHint="Dismisses this quick edit panel."
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
            >
              <Icon as={X} size={24} className="text-muted-foreground" />
            </Pressable>
          </View>
          <ScrollView className="max-h-[70vh]">
            <View className="gap-3 px-6 pb-4 pt-6">
              {!canEditActivity ? (
                <Text className="text-xs text-muted-foreground">
                  Activity category is locked by the attached plan.
                </Text>
              ) : null}
              {QUICK_ACTIVITIES.map((activity) => {
                const isSelected = currentCategory === activity.category;
                return (
                  <Pressable
                    key={activity.category}
                    onPress={() => handleCategorySelect(activity.category)}
                    disabled={!canEditActivity}
                    testID={`activity-select-${activity.category}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canEditActivity, selected: isSelected }}
                    accessibilityLabel={`${getActivityDisplayName(activity.category, true)} activity`}
                    className={`min-h-11 flex-row items-center rounded-xl border-2 p-4 ${
                      isSelected ? "border-primary bg-primary/10" : "border-border bg-card"
                    } ${canEditActivity ? "active:opacity-80" : ""}`}
                    style={{ opacity: canEditActivity || isSelected ? 1 : 0.5 }}
                  >
                    <View
                      className={`mr-3 h-12 w-12 items-center justify-center rounded-full ${activity.bgColor}`}
                    >
                      <Icon as={activity.icon} size={24} className={activity.color} />
                    </View>
                    <Text className="flex-1 text-base font-semibold">
                      {getActivityDisplayName(activity.category, true).split(" ")[0]}
                    </Text>
                    {isSelected ? (
                      <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
                        <Text className="text-xs font-bold text-primary-foreground">✓</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});
