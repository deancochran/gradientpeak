import { getActivityDisplayName, type RecordingActivityCategory } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Activity, Bike, Dumbbell, Footprints, MapPin, Waves } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

interface InlineActivitySelectorProps {
  onActivitySelect: (category: RecordingActivityCategory, gpsRecordingEnabled: boolean) => void;
}

// Simplified activity configurations for inline selector
const QUICK_ACTIVITIES: {
  category: RecordingActivityCategory;
  icon: any;
  color: string;
}[] = [
  { category: "run", icon: Footprints, color: "text-emerald-600" },
  { category: "bike", icon: Bike, color: "text-blue-600" },
  { category: "swim", icon: Waves, color: "text-cyan-600" },
  { category: "strength", icon: Dumbbell, color: "text-red-600" },
  { category: "other", icon: Activity, color: "text-gray-600" },
];

export function InlineActivitySelector({ onActivitySelect }: InlineActivitySelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<RecordingActivityCategory | null>(null);
  const [gpsRecordingEnabled, setGpsRecordingEnabled] = useState<boolean | null>(null);

  const handleGpsSelect = (nextGpsRecordingEnabled: boolean) => {
    setGpsRecordingEnabled(nextGpsRecordingEnabled);
    if (selectedCategory) {
      onActivitySelect(selectedCategory, nextGpsRecordingEnabled);
    }
  };

  return (
    <View className="bg-card border-b border-border px-4 py-6">
      {/* Step 1: Select Activity Type */}
      <View className="mb-4">
        <Text className="text-sm font-medium text-muted-foreground mb-3">Select Activity</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-3">
          {QUICK_ACTIVITIES.map((activity) => (
            <Pressable
              key={activity.category}
              onPress={() => {
                setSelectedCategory(activity.category);
                setGpsRecordingEnabled(null); // Reset GPS state when changing activity
              }}
              className={`items-center justify-center px-4 py-3 rounded-xl border-2 ${
                selectedCategory === activity.category
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted"
              }`}
            >
              <Icon
                as={activity.icon}
                size={28}
                className={selectedCategory === activity.category ? "text-primary" : activity.color}
              />
              <Text
                className={`text-xs font-medium mt-2 ${
                  selectedCategory === activity.category ? "text-primary" : "text-foreground"
                }`}
              >
                {getActivityDisplayName(activity.category, true).split(" ")[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Step 2: Select GPS recording (only shown when activity selected) */}
      {selectedCategory && (
        <View>
          <Text className="text-sm font-medium text-muted-foreground mb-3">GPS Recording</Text>
          <View className="flex-row gap-3">
            <Button
              variant={gpsRecordingEnabled === true ? "default" : "outline"}
              onPress={() => handleGpsSelect(true)}
              className="flex-1 h-14"
            >
              <Icon
                as={MapPin}
                size={20}
                className={gpsRecordingEnabled === true ? "color-background" : "text-foreground"}
              />
              <Text
                className={`ml-2 font-semibold ${
                  gpsRecordingEnabled === true ? "text-background" : "text-foreground"
                }`}
              >
                GPS ON
              </Text>
            </Button>
            <Button
              variant={gpsRecordingEnabled === false ? "default" : "outline"}
              onPress={() => handleGpsSelect(false)}
              className="flex-1 h-14"
            >
              <Icon
                as={Activity}
                size={20}
                className={gpsRecordingEnabled === false ? "color-background" : "text-foreground"}
              />
              <Text
                className={`ml-2 font-semibold ${
                  gpsRecordingEnabled === false ? "text-background" : "text-foreground"
                }`}
              >
                GPS OFF
              </Text>
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
