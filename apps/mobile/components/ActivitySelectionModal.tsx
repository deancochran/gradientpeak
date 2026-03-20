/**
 * ActivitySelectionModal - Stateless Activity Picker
 *
 * ## Problem This Solves
 *
 * Previously, this modal maintained internal state (selectedCategory, gpsRecordingEnabled)
 * that was synchronized with parent props via useEffect. This caused a race condition:
 *
 * 1. User toggles GPS and picks a category → modal calls onActivitySelect()
 * 2. Parent updates service → service emits "activitySelected" event
 * 3. Parent component re-renders with new props
 * 4. Modal's useEffect tries to sync with new props
 * 5. Modal simultaneously tries to close via onClose()
 * 6. React error: inconsistent state during render cycle
 *
 * ## Solution
 *
 * The modal is now completely stateless:
 * - No internal state (no useState)
 * - No prop synchronization (no useEffect)
 * - Props are renamed from "initial" to "current" to reflect they're not just initial values
 * - Parent controls all state via currentCategory and currentGpsRecordingEnabled props
 * - When user clicks, modal immediately closes and notifies parent
 * - No race conditions possible because modal doesn't manage or sync any state
 *
 * ## Usage
 *
 * ```tsx
 * const [category, setCategory] = useState<PublicActivityCategory>("run");
 * const [gpsRecordingEnabled, setGpsRecordingEnabled] = useState(true);
 *
 * <ActivitySelectionModal
 *   visible={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onActivitySelect={(cat, gpsEnabled) => {
 *     setCategory(cat);
 *     setGpsRecordingEnabled(gpsEnabled);
 *     service.selectActivity(cat, gpsEnabled);
 *   }}
 *   currentCategory={category}
 *   currentGpsRecordingEnabled={gpsRecordingEnabled}
 * />
 * ```
 */

import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { getActivityDisplayName } from "@repo/core";
import type { PublicActivityCategory } from "@repo/supabase";
import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  MapPin,
  Waves,
  X,
} from "lucide-react-native";
import { memo } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

interface ActivitySelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onActivitySelect: (
    category: PublicActivityCategory,
    gpsRecordingEnabled: boolean,
  ) => void;
  currentCategory: PublicActivityCategory;
  currentGpsRecordingEnabled: boolean;
}

// Simplified activity configurations
const QUICK_ACTIVITIES: {
  category: PublicActivityCategory;
  icon: any;
  color: string;
  bgColor: string;
}[] = [
  {
    category: "run",
    icon: Footprints,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
  {
    category: "bike",
    icon: Bike,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    category: "swim",
    icon: Waves,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
  },
  {
    category: "strength",
    icon: Dumbbell,
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
  {
    category: "other",
    icon: Activity,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
  },
];

/**
 * Activity Selection Modal - Completely Stateless
 *
 * This modal is now a pure presentational component with zero internal state.
 * All state is managed by the parent, eliminating race conditions.
 *
 * When user makes a selection:
 * 1. Modal immediately closes (onClose)
 * 2. Selection is reported to parent (onActivitySelect)
 * 3. Parent updates its state without the modal interfering
 */
export const ActivitySelectionModal = memo(function ActivitySelectionModal({
  visible,
  onClose,
  onActivitySelect,
  currentCategory,
  currentGpsRecordingEnabled,
}: ActivitySelectionModalProps) {
  // No internal state - completely controlled by parent

  const handleCategorySelect = (category: PublicActivityCategory) => {
    // Immediately close and notify parent
    onClose();
    onActivitySelect(category, currentGpsRecordingEnabled);
  };

  const handleGpsChange = (gpsRecordingEnabled: boolean) => {
    // Immediately close and notify parent
    onClose();
    onActivitySelect(currentCategory, gpsRecordingEnabled);
  };

  // Don't render modal content if not visible to avoid unnecessary renders
  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50">
        {/* Backdrop - tap to close */}
        <Pressable className="flex-1" onPress={onClose} />

        {/* Modal Content */}
        <View className="bg-background rounded-t-3xl pb-8">
          {/* Header */}
          <View className="flex-row items-center justify-between px-6 pt-6 pb-4 border-b border-border">
            <Text className="text-2xl font-bold">Select Activity</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Icon as={X} size={24} className="text-muted-foreground" />
            </Pressable>
          </View>

          <ScrollView className="max-h-[70vh]">
            <View className="px-6 pt-6">
              {/* GPS Toggle at Top */}
              <View className="mb-6">
                <View className="flex-row bg-muted rounded-xl p-1">
                  <Pressable
                    onPress={() => handleGpsChange(true)}
                    className={`flex-1 py-3 rounded-lg items-center ${
                      currentGpsRecordingEnabled
                        ? "bg-background shadow-sm"
                        : ""
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Icon
                        as={MapPin}
                        size={18}
                        className={
                          currentGpsRecordingEnabled
                            ? "text-primary"
                            : "text-muted-foreground"
                        }
                      />
                      <Text
                        className={`font-semibold ${
                          currentGpsRecordingEnabled
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        GPS ON
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => handleGpsChange(false)}
                    className={`flex-1 py-3 rounded-lg items-center ${
                      !currentGpsRecordingEnabled
                        ? "bg-background shadow-sm"
                        : ""
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Icon
                        as={Activity}
                        size={18}
                        className={
                          !currentGpsRecordingEnabled
                            ? "text-primary"
                            : "text-muted-foreground"
                        }
                      />
                      <Text
                        className={`font-semibold ${
                          !currentGpsRecordingEnabled
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        GPS OFF
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              {/* Activity Categories */}
              <View className="gap-3 pb-4">
                {QUICK_ACTIVITIES.map((activity) => {
                  const isSelected = currentCategory === activity.category;

                  return (
                    <Pressable
                      key={activity.category}
                      onPress={() => handleCategorySelect(activity.category)}
                      className={`flex-row items-center p-4 rounded-xl border-2 ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card"
                      }`}
                    >
                      <View
                        className={`w-12 h-12 rounded-full ${activity.bgColor} items-center justify-center mr-3`}
                      >
                        <Icon
                          as={activity.icon}
                          size={24}
                          className={activity.color}
                        />
                      </View>

                      <View className="flex-1">
                        <Text className="font-semibold text-base">
                          {
                            getActivityDisplayName(
                              activity.category,
                              true,
                            ).split(" ")[0]
                          }
                        </Text>
                      </View>

                      {isSelected && (
                        <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                          <Text className="text-primary-foreground text-xs font-bold">
                            ✓
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});
