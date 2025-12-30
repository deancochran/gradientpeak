/**
 * ActivitySelectionModal - Stateless Activity Picker
 *
 * ## Problem This Solves
 *
 * Previously, this modal maintained internal state (selectedCategory, selectedLocation)
 * that was synchronized with parent props via useEffect. This caused a race condition:
 *
 * 1. User clicks "Indoor" → modal calls onActivitySelect()
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
 * - Parent controls all state via currentCategory and currentLocation props
 * - When user clicks, modal immediately closes and notifies parent
 * - No race conditions possible because modal doesn't manage or sync any state
 *
 * ## Usage
 *
 * ```tsx
 * const [category, setCategory] = useState<PublicActivityCategory>("run");
 * const [location, setLocation] = useState<PublicActivityLocation>("outdoor");
 *
 * <ActivitySelectionModal
 *   visible={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onActivitySelect={(cat, loc) => {
 *     setCategory(cat);
 *     setLocation(loc);
 *     service.selectActivity(cat, loc);
 *   }}
 *   currentCategory={category}
 *   currentLocation={location}
 * />
 * ```
 */

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  PublicActivityCategory,
  PublicActivityLocation,
  getActivityDisplayName,
} from "@repo/core";
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
    location: PublicActivityLocation,
  ) => void;
  currentCategory: PublicActivityCategory;
  currentLocation: PublicActivityLocation;
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
  currentLocation,
}: ActivitySelectionModalProps) {
  // No internal state - completely controlled by parent

  const handleCategorySelect = (category: PublicActivityCategory) => {
    // Immediately close and notify parent
    onClose();
    onActivitySelect(category, currentLocation);
  };

  const handleLocationChange = (location: PublicActivityLocation) => {
    // Immediately close and notify parent
    onClose();
    onActivitySelect(currentCategory, location);
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
              {/* Indoor/Outdoor Toggle at Top */}
              <View className="mb-6">
                <View className="flex-row bg-muted rounded-xl p-1">
                  <Pressable
                    onPress={() => handleLocationChange("outdoor")}
                    className={`flex-1 py-3 rounded-lg items-center ${
                      currentLocation === "outdoor"
                        ? "bg-background shadow-sm"
                        : ""
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Icon
                        as={MapPin}
                        size={18}
                        className={
                          currentLocation === "outdoor"
                            ? "text-primary"
                            : "text-muted-foreground"
                        }
                      />
                      <Text
                        className={`font-semibold ${
                          currentLocation === "outdoor"
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        Outdoor
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => handleLocationChange("indoor")}
                    className={`flex-1 py-3 rounded-lg items-center ${
                      currentLocation === "indoor"
                        ? "bg-background shadow-sm"
                        : ""
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Icon
                        as={Activity}
                        size={18}
                        className={
                          currentLocation === "indoor"
                            ? "text-primary"
                            : "text-muted-foreground"
                        }
                      />
                      <Text
                        className={`font-semibold ${
                          currentLocation === "indoor"
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        Indoor
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
                              "outdoor",
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
