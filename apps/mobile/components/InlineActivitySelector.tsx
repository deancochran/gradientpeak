import { Button } from "@/components/ui/button";
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
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

interface InlineActivitySelectorProps {
  onActivitySelect: (
    category: PublicActivityCategory,
    location: PublicActivityLocation,
  ) => void;
}

// Simplified activity configurations for inline selector
const QUICK_ACTIVITIES: {
  category: PublicActivityCategory;
  icon: any;
  color: string;
}[] = [
  { category: "run", icon: Footprints, color: "text-emerald-600" },
  { category: "bike", icon: Bike, color: "text-blue-600" },
  { category: "swim", icon: Waves, color: "text-cyan-600" },
  { category: "strength", icon: Dumbbell, color: "text-red-600" },
  { category: "other", icon: Activity, color: "text-gray-600" },
];

export function InlineActivitySelector({
  onActivitySelect,
}: InlineActivitySelectorProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<PublicActivityCategory | null>(null);
  const [selectedLocation, setSelectedLocation] =
    useState<PublicActivityLocation | null>(null);

  // Auto-confirm when both selections made
  const handleLocationSelect = (location: PublicActivityLocation) => {
    setSelectedLocation(location);
    if (selectedCategory) {
      onActivitySelect(selectedCategory, location);
    }
  };

  return (
    <View className="bg-card border-b border-border px-4 py-6">
      {/* Step 1: Select Activity Type */}
      <View className="mb-4">
        <Text className="text-sm font-medium text-muted-foreground mb-3">
          Select Activity
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-row gap-3"
        >
          {QUICK_ACTIVITIES.map((activity) => (
            <Pressable
              key={activity.category}
              onPress={() => {
                setSelectedCategory(activity.category);
                setSelectedLocation(null); // Reset location when changing activity
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
                className={
                  selectedCategory === activity.category
                    ? "text-primary"
                    : activity.color
                }
              />
              <Text
                className={`text-xs font-medium mt-2 ${
                  selectedCategory === activity.category
                    ? "text-primary"
                    : "text-foreground"
                }`}
              >
                {getActivityDisplayName(activity.category, "outdoor").split(
                  " ",
                )[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Step 2: Select Location (only shown when activity selected) */}
      {selectedCategory && (
        <View>
          <Text className="text-sm font-medium text-muted-foreground mb-3">
            Location
          </Text>
          <View className="flex-row gap-3">
            <Button
              variant={
                selectedLocation === "outdoor" ? "default" : "outline"
              }
              onPress={() => handleLocationSelect("outdoor")}
              className="flex-1 h-14"
            >
              <Icon
                as={MapPin}
                size={20}
                className={
                  selectedLocation === "outdoor"
                    ? "color-background"
                    : "text-foreground"
                }
              />
              <Text
                className={`ml-2 font-semibold ${
                  selectedLocation === "outdoor"
                    ? "text-background"
                    : "text-foreground"
                }`}
              >
                Outdoor
              </Text>
            </Button>
            <Button
              variant={selectedLocation === "indoor" ? "default" : "outline"}
              onPress={() => handleLocationSelect("indoor")}
              className="flex-1 h-14"
            >
              <Icon
                as={Activity}
                size={20}
                className={
                  selectedLocation === "indoor"
                    ? "color-background"
                    : "text-foreground"
                }
              />
              <Text
                className={`ml-2 font-semibold ${
                  selectedLocation === "indoor"
                    ? "text-background"
                    : "text-foreground"
                }`}
              >
                Indoor
              </Text>
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
