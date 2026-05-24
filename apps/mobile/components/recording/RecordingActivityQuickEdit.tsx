/**
 * RecordingActivityQuickEdit - Stateless recorder activity/GPS editor
 *
 * ## Problem This Solves
 *
 * Previously, this sheet maintained internal state (selectedCategory, gpsRecordingEnabled)
 * that was synchronized with parent props via useEffect. This caused a race condition:
 *
 * 1. User toggles GPS and picks a category -> sheet calls onActivitySelect()
 * 2. Parent updates service → service emits "activitySelected" event
 * 3. Parent component re-renders with new props
 * 4. The sheet's useEffect tries to sync with new props
 * 5. The sheet simultaneously tries to close via onClose()
 * 6. React error: inconsistent state during render cycle
 *
 * ## Solution
 *
 * The quick edit sheet is completely stateless:
 * - No internal state (no useState)
 * - No prop synchronization (no useEffect)
 * - Props are renamed from "initial" to "current" to reflect they're not just initial values
 * - Parent controls all state via currentCategory and currentGpsRecordingEnabled props
 * - When user clicks, the sheet immediately closes and notifies parent
 * - No race conditions possible because the sheet doesn't manage or sync any state
 *
 * ## Usage
 *
 * ```tsx
 * const [category, setCategory] = useState<RecordingActivityCategory>("run");
 * const [gpsRecordingEnabled, setGpsRecordingEnabled] = useState(true);
 *
 * <RecordingActivityQuickEdit
 *   visible={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onActivitySelect={(cat, gpsEnabled) => {
 *     setCategory(cat);
 *     setGpsRecordingEnabled(gpsEnabled);
 *     service.selectActivity(cat, gpsEnabled);
 *   }}
 *   currentCategory={category}
 *   currentGpsRecordingEnabled={gpsRecordingEnabled}
 *   canEditActivity={true}
 *   canEditGps={true}
 * />
 * ```
 */

import { getActivityDisplayName, type RecordingActivityCategory } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { ToggleGroup, ToggleGroupIcon, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Activity, Bike, Dumbbell, Footprints, MapPin, Waves, X } from "lucide-react-native";
import { memo } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

interface RecordingActivityQuickEditProps {
  visible: boolean;
  onClose: () => void;
  onActivitySelect: (category: RecordingActivityCategory, gpsRecordingEnabled: boolean) => void;
  currentCategory: RecordingActivityCategory;
  currentGpsRecordingEnabled: boolean;
  canEditActivity: boolean;
  canEditGps: boolean;
}

// Simplified activity configurations
const QUICK_ACTIVITIES: {
  category: RecordingActivityCategory;
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
 * Recorder activity/GPS quick edit - completely stateless
 *
 * This sheet is a pure presentational component with zero internal state.
 * All state is managed by the parent, eliminating race conditions.
 *
 * When user makes a selection:
 * 1. Sheet immediately closes (onClose)
 * 2. Selection is reported to parent (onActivitySelect)
 * 3. Parent updates its state without the sheet interfering
 */
export const RecordingActivityQuickEdit = memo(function RecordingActivityQuickEdit({
  visible,
  onClose,
  onActivitySelect,
  currentCategory,
  currentGpsRecordingEnabled,
  canEditActivity,
  canEditGps,
}: RecordingActivityQuickEditProps) {
  // No internal state - completely controlled by parent

  const handleCategorySelect = (category: RecordingActivityCategory) => {
    if (!canEditActivity) {
      return;
    }

    // Immediately close and notify parent
    onClose();
    onActivitySelect(category, currentGpsRecordingEnabled);
  };

  const handleGpsChange = (gpsRecordingEnabled: boolean) => {
    if (!canEditGps) {
      return;
    }

    // Immediately close and notify parent
    onClose();
    onActivitySelect(currentCategory, gpsRecordingEnabled);
  };

  // Don't render sheet content if not visible to avoid unnecessary renders
  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View className="flex-1 bg-black/50">
        {/* Backdrop - tap to close */}
        <Pressable className="flex-1" onPress={onClose} />

        {/* Sheet Content */}
        <View className="bg-background rounded-t-3xl pb-8" testID="recording-activity-quick-edit">
          {/* Header */}
          <View className="flex-row items-center justify-between px-6 pt-6 pb-4 border-b border-border">
            <View className="flex-1 pr-4">
              <Text className="text-2xl font-bold">Activity and GPS</Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                Quick edits apply to this recording session.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Icon as={X} size={24} className="text-muted-foreground" />
            </Pressable>
          </View>

          <ScrollView className="max-h-[70vh]">
            <View className="px-6 pt-6">
              {/* GPS Toggle at Top */}
              <View className="mb-6">
                {!canEditGps ? (
                  <Text className="mb-2 text-xs text-muted-foreground">
                    GPS recording is locked for the active session.
                  </Text>
                ) : null}
                <View className="rounded-xl bg-muted p-1">
                  <ToggleGroup
                    type="single"
                    value={currentGpsRecordingEnabled ? "gps-on" : "gps-off"}
                    onValueChange={(nextValue: string | undefined) => {
                      if (!canEditGps) {
                        return;
                      }

                      if (nextValue === "gps-on") {
                        handleGpsChange(true);
                      } else if (nextValue === "gps-off") {
                        handleGpsChange(false);
                      }
                    }}
                    className="w-full"
                  >
                    <ToggleGroupItem
                      value="gps-on"
                      testID="gps-on-option"
                      isFirst
                      disabled={!canEditGps}
                      className={`flex-1 py-3 ${
                        currentGpsRecordingEnabled ? "bg-background shadow-sm" : ""
                      }`}
                    >
                      <View className="flex-row items-center gap-2">
                        <ToggleGroupIcon
                          as={MapPin}
                          size={18}
                          className={
                            currentGpsRecordingEnabled ? "text-primary" : "text-muted-foreground"
                          }
                        />
                        <Text
                          className={`font-semibold ${
                            currentGpsRecordingEnabled ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          GPS ON
                        </Text>
                      </View>
                    </ToggleGroupItem>

                    <ToggleGroupItem
                      value="gps-off"
                      testID="gps-off-option"
                      isLast
                      disabled={!canEditGps}
                      className={`flex-1 py-3 ${
                        !currentGpsRecordingEnabled ? "bg-background shadow-sm" : ""
                      }`}
                    >
                      <View className="flex-row items-center gap-2">
                        <ToggleGroupIcon
                          as={Activity}
                          size={18}
                          className={
                            !currentGpsRecordingEnabled ? "text-primary" : "text-muted-foreground"
                          }
                        />
                        <Text
                          className={`font-semibold ${
                            !currentGpsRecordingEnabled ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          GPS OFF
                        </Text>
                      </View>
                    </ToggleGroupItem>
                  </ToggleGroup>
                </View>
              </View>

              {/* Activity Categories */}
              <View className="gap-3 pb-4">
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
                      className={`flex-row items-center p-4 rounded-xl border-2 ${
                        isSelected ? "border-primary bg-primary/10" : "border-border bg-card"
                      }`}
                      style={{ opacity: canEditActivity || isSelected ? 1 : 0.5 }}
                    >
                      <View
                        className={`w-12 h-12 rounded-full ${activity.bgColor} items-center justify-center mr-3`}
                      >
                        <Icon as={activity.icon} size={24} className={activity.color} />
                      </View>

                      <View className="flex-1">
                        <Text className="font-semibold text-base">
                          {getActivityDisplayName(activity.category, true).split(" ")[0]}
                        </Text>
                      </View>

                      {isSelected && (
                        <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                          <Text className="text-primary-foreground text-xs font-bold">✓</Text>
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
