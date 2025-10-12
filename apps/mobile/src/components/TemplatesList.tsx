import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import {
  ActivityType,
  getSampleActivitiesByType,
  shouldUseFollowAlong,
} from "@repo/core";
import { useRouter } from "expo-router";
import {
  Activity,
  ArrowLeft,
  Bike,
  ChevronRight,
  Clock,
  Code,
  Dumbbell,
  Footprints,
  Waves,
} from "lucide-react-native";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";

// Category configurations
const CATEGORIES = [
  {
    id: "outdoor_run",
    name: "Running",
    icon: Footprints,
    color: "text-emerald-600",
    activityType: "outdoor_run" as ActivityType,
  },
  {
    id: "outdoor_bike",
    name: "Cycling",
    icon: Bike,
    color: "text-blue-600",
    activityType: "outdoor_bike" as ActivityType,
  },
  {
    id: "indoor_bike_trainer",
    name: "Indoor Cycling",
    icon: Bike,
    color: "text-orange-600",
    activityType: "indoor_bike_trainer" as ActivityType,
  },
  {
    id: "indoor_treadmill",
    name: "Treadmill",
    icon: Footprints,
    color: "text-purple-600",
    activityType: "indoor_treadmill" as ActivityType,
  },
  {
    id: "indoor_strength",
    name: "Strength",
    icon: Dumbbell,
    color: "text-red-600",
    activityType: "indoor_strength" as ActivityType,
  },
  {
    id: "indoor_swim",
    name: "Swimming",
    icon: Waves,
    color: "text-cyan-600",
    activityType: "indoor_swim" as ActivityType,
  },
  {
    id: "other",
    name: "Other",
    icon: Activity,
    color: "text-gray-600",
    activityType: "other" as ActivityType,
  },
  // Conditionally spread the dev object into the array
  ...(__DEV__
    ? [
        {
          id: "dev",
          name: "Dev",
          icon: Code,
          color: "text-blue-600",
          activityType: "dev" as ActivityType,
        },
      ]
    : []),
];
interface TemplatesListProps {
  onTemplateSelect: (template: any) => void;
}

export function TemplatesList({ onTemplateSelect }: TemplatesListProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // If no category selected, show category list
  if (!selectedCategory) {
    return (
      <View className="gap-3">
        <Text className="text-sm text-muted-foreground mb-2">
          Choose an activity type to see available templates
        </Text>

        {CATEGORIES.map((category) => {
          const templates = getSampleActivitiesByType(category.activityType);

          return (
            <TouchableOpacity
              key={category.id}
              onPress={() => setSelectedCategory(category.id)}
              className="bg-card border border-border rounded-xl p-4 flex-row items-center"
            >
              <View className="mr-4">
                <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
                  <Icon
                    as={category.icon}
                    size={24}
                    className={category.color}
                  />
                </View>
              </View>

              <View className="flex-1">
                <Text className="text-lg font-semibold mb-1">
                  {category.name}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {templates.length} template{templates.length !== 1 ? "s" : ""}{" "}
                  available
                </Text>
              </View>

              <View className="ml-2">
                <Icon
                  as={ChevronRight}
                  size={20}
                  className="text-muted-foreground"
                />
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

  const templates = getSampleActivitiesByType(category.activityType);

  return (
    <View className="gap-3">
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
        <TemplateCard
          key={index}
          template={template}
          category={category}
          onSelect={() => handleTemplateSelect(template)}
          router={router}
        />
      ))}
    </View>
  );

  // Handle template selection with routing logic
  function handleTemplateSelect(template: any) {
    // Route based on activity type - swim, strength, and other must use follow-along
    if (shouldUseFollowAlong(template.activity_type)) {
      // Store selection for follow-along
      const payload = {
        type: template.activity_type,
        plan: template, // template is already a RecordingServiceActivityPlan
      };
      activitySelectionStore.setSelection(payload);
      router.push("/follow-along"); // No parameters!
    } else {
      // Use callback for other activity types (cardio activities)
      onTemplateSelect(template);
    }
  }
}

interface TemplateCardProps {
  template: any;
  category: (typeof CATEGORIES)[0];
  onSelect: () => void;
  router: any;
}

function TemplateCard({ template, category, onSelect }: TemplateCardProps) {
  // Calculate total duration estimate
  const getTotalDurationEstimate = (structure: any): number => {
    if (!structure?.steps) return 0;

    let totalMs = 0;
    structure.steps.forEach((step: any) => {
      if (step.type === "step" && step.duration) {
        if (step.duration.type === "time" && step.duration.unit === "minutes") {
          totalMs += step.duration.value * 60 * 1000;
        } else if (
          step.duration.type === "time" &&
          step.duration.unit === "seconds"
        ) {
          totalMs += step.duration.value * 1000;
        }
      } else if (step.type === "repetition" && step.steps) {
        step.steps.forEach((subStep: any) => {
          if (
            subStep.duration?.type === "time" &&
            subStep.duration.unit === "minutes"
          ) {
            totalMs += subStep.duration.value * step.repeat * 60 * 1000;
          } else if (
            subStep.duration?.type === "time" &&
            subStep.duration.unit === "seconds"
          ) {
            totalMs += subStep.duration.value * step.repeat * 1000;
          }
        });
      }
    });

    return Math.round(totalMs / 60000); // Convert to minutes
  };

  const duration = getTotalDurationEstimate(template.structure);

  return (
    <Button
      variant="outline"
      onPress={onSelect}
      className="h-auto p-4 bg-card border border-border rounded-xl"
    >
      <View className="flex-row items-start w-full">
        {/* Icon */}
        <View className="mr-3 mt-1">
          <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
            <Icon as={category.icon} size={20} className={category.color} />
          </View>
        </View>

        {/* Content */}
        <View className="flex-1">
          <Text className="text-lg font-semibold mb-1">{template.name}</Text>

          {template.description && (
            <Text className="text-sm text-muted-foreground mb-2">
              {template.description}
            </Text>
          )}

          {/* Metadata */}
          <View className="flex-row items-center gap-4">
            {duration > 0 && (
              <View className="flex-row items-center">
                <Icon
                  as={Clock}
                  size={14}
                  className="text-muted-foreground mr-1"
                />
                <Text className="text-xs text-muted-foreground">
                  {duration} min
                </Text>
              </View>
            )}

            {template.estimated_tss && (
              <View className="flex-row items-center">
                <Text className="text-xs text-muted-foreground">
                  TSS: {template.estimated_tss}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Arrow */}
        <View className="ml-2 mt-1">
          <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
        </View>
      </View>
    </Button>
  );
}
