import { type ActivityCategory, ActivityPayload, getSampleActivitiesByCategory } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import {
  Activity,
  ArrowLeft,
  Bike,
  ChevronRight,
  Code,
  Dumbbell,
  Footprints,
  Smartphone,
  Waves,
} from "lucide-react-native";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { ActivityPlanCard, ActivityPlanCardData } from "@/components/shared/ActivityPlanCard";

// Category configurations
const CATEGORIES = [
  {
    id: "run-outdoor",
    name: "Running",
    icon: Footprints,
    color: "text-emerald-600",
    category: "run" as ActivityCategory,
    gpsRecordingEnabled: true,
  },
  {
    id: "bike-outdoor",
    name: "Cycling",
    icon: Bike,
    color: "text-blue-600",
    category: "bike" as ActivityCategory,
    gpsRecordingEnabled: true,
  },
  {
    id: "bike-indoor",
    name: "Indoor Cycling",
    icon: Bike,
    color: "text-orange-600",
    category: "bike" as ActivityCategory,
    gpsRecordingEnabled: false,
  },
  {
    id: "run-indoor",
    name: "Treadmill",
    icon: Footprints,
    color: "text-purple-600",
    category: "run" as ActivityCategory,
    gpsRecordingEnabled: false,
  },
  {
    id: "strength-indoor",
    name: "Strength",
    icon: Dumbbell,
    color: "text-red-600",
    category: "strength" as ActivityCategory,
    gpsRecordingEnabled: false,
  },
  {
    id: "swim-indoor",
    name: "Swimming",
    icon: Waves,
    color: "text-cyan-600",
    category: "swim" as ActivityCategory,
    gpsRecordingEnabled: false,
  },
  {
    id: "other-outdoor",
    name: "Other",
    icon: Activity,
    color: "text-gray-600",
    category: "other" as ActivityCategory,
    gpsRecordingEnabled: true,
  },
  // Conditionally spread the dev object into the array
  ...(__DEV__
    ? [
        {
          id: "dev-outdoor",
          name: "Dev",
          icon: Code,
          color: "text-blue-600",
          category: "dev" as any,
          gpsRecordingEnabled: true,
        },
      ]
    : []),
];
interface TemplatesListProps {
  onTemplateSelect: (template: any) => void;
}

// Transform template to ActivityPlanCardData format
function transformTemplateToCardData(template: any): ActivityPlanCardData {
  return {
    id: template.id || `template-${template.name}`,
    name: template.name,
    activityType: template.activity_category || "other",
    structure: template.structure,
    estimatedDuration: template.estimated_duration,
    estimatedTss: template.estimated_tss,
    estimatedDistance: template.structure?.route?.distance,
    routeId: template.route_id,
    routeName: template.structure?.route?.name,
    notes: template.description, // Map description to notes for display
  };
}

export function TemplatesList({ onTemplateSelect }: TemplatesListProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // If no category selected, show category list
  if (!selectedCategory) {
    return (
      <View className="gap-2">
        {CATEGORIES.map((category) => {
          const templates = getSampleActivitiesByCategory(
            category.category as any,
            category.gpsRecordingEnabled,
          );

          return (
            <TouchableOpacity
              key={category.id}
              onPress={() => setSelectedCategory(category.id)}
              className="bg-card border border-border rounded-xl p-4 flex-row items-center"
            >
              <View className="mr-4">
                <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
                  <Icon as={category.icon} size={24} className={category.color} />
                </View>
              </View>

              <View className="flex-1">
                <Text className="text-lg font-semibold mb-1">{category.name}</Text>
                <Text className="text-sm text-muted-foreground">
                  {templates.length} template{templates.length !== 1 ? "s" : ""} available
                </Text>
              </View>

              <View className="ml-2">
                <Icon as={ChevronRight} size={20} className="text-muted-foreground" />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // Show templates for selected category
  const category = CATEGORIES.find((c) => c.id === selectedCategory);
  if (!category) return null;

  const templates = getSampleActivitiesByCategory(
    category.category as any,
    category.gpsRecordingEnabled,
  );

  return (
    <View className="gap-2">
      {/* Back button */}
      <TouchableOpacity
        onPress={() => setSelectedCategory(null)}
        className="flex-row items-center mb-2"
      >
        <Icon as={ArrowLeft} size={20} className="text-primary mr-2" />
        <Text className="text-primary font-medium">Back to Categories</Text>
      </TouchableOpacity>

      <Text className="text-sm text-muted-foreground mb-2">
        {category.name} Templates ({templates.length})
      </Text>

      {templates.map((template, index) => (
        <View key={index} className="relative">
          <ActivityPlanCard
            activity={transformTemplateToCardData(template)}
            onPress={() => handleNavigateToDetail(template)}
            variant="default"
            showScheduleInfo={false}
          />
          {/* Quick-action Record Button */}
          <TouchableOpacity
            className="absolute top-3 right-3 bg-primary rounded-full p-2 shadow-sm"
            onPress={(e) => {
              e.stopPropagation();
              handleRecord(template);
            }}
          >
            <Icon as={Smartphone} size={18} className="text-primary-foreground" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  // Handle navigation to activity plan detail page
  function handleNavigateToDetail(template: any) {
    router.push({
      pathname: "/activity-plan-detail" as any,
      params: { template: JSON.stringify(template) },
    });
  }

  // Handle template selection for record mode
  function handleRecord(template: any) {
    const payload: ActivityPayload = {
      category: template.activity_category,
      gpsRecordingEnabled: true,
      plan: template,
    };
    onTemplateSelect(payload);
  }
}
