import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import type {
  PublicActivityCategory,
  PublicActivityLocation,
} from "@repo/core";
import { ActivityPayload, getSampleActivitiesByCategory } from "@repo/core";
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
  Play,
  Smartphone,
  Waves,
} from "lucide-react-native";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";

// Category configurations
const CATEGORIES = [
  {
    id: "run-outdoor",
    name: "Running",
    icon: Footprints,
    color: "text-emerald-600",
    category: "run" as PublicActivityCategory,
    location: "outdoor" as PublicActivityLocation,
  },
  {
    id: "bike-outdoor",
    name: "Cycling",
    icon: Bike,
    color: "text-blue-600",
    category: "bike" as PublicActivityCategory,
    location: "outdoor" as PublicActivityLocation,
  },
  {
    id: "bike-indoor",
    name: "Indoor Cycling",
    icon: Bike,
    color: "text-orange-600",
    category: "bike" as PublicActivityCategory,
    location: "indoor" as PublicActivityLocation,
  },
  {
    id: "run-indoor",
    name: "Treadmill",
    icon: Footprints,
    color: "text-purple-600",
    category: "run" as PublicActivityCategory,
    location: "indoor" as PublicActivityLocation,
  },
  {
    id: "strength-indoor",
    name: "Strength",
    icon: Dumbbell,
    color: "text-red-600",
    category: "strength" as PublicActivityCategory,
    location: "indoor" as PublicActivityLocation,
  },
  {
    id: "swim-indoor",
    name: "Swimming",
    icon: Waves,
    color: "text-cyan-600",
    category: "swim" as PublicActivityCategory,
    location: "indoor" as PublicActivityLocation,
  },
  {
    id: "other-outdoor",
    name: "Other",
    icon: Activity,
    color: "text-gray-600",
    category: "other" as PublicActivityCategory,
    location: "outdoor" as PublicActivityLocation,
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
          location: "outdoor" as PublicActivityLocation,
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
        {CATEGORIES.map((category) => {
          const templates = getSampleActivitiesByCategory(
            category.category as any,
            category.location,
          );

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

  const templates = getSampleActivitiesByCategory(
    category.category as any,
    category.location,
  );

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
          onFollowAlong={() => handleFollowAlong(template)}
          onRecord={() => handleRecord(template)}
        />
      ))}
    </View>
  );

  // Handle template selection for follow along mode
  function handleFollowAlong(template: any) {
    const payload: ActivityPayload = {
      category: template.activity_category,
      location: template.activity_location || category.location,
      plan: template,
    };
    activitySelectionStore.setSelection(payload);
    router.push("/follow-along");
  }

  // Handle template selection for record mode
  function handleRecord(template: any) {
    const payload: ActivityPayload = {
      category: template.activity_category,
      location: template.activity_location || category.location,
      plan: template,
    };
    onTemplateSelect(payload);
  }
}

// Define the category type
type CategoryWithTemplates = (typeof CATEGORIES)[0];

interface TemplateCardProps {
  template: any;
  category: CategoryWithTemplates;
  onFollowAlong: () => void;
  onRecord: () => void;
}

function TemplateCard({
  template,
  category,
  onFollowAlong,
  onRecord,
}: TemplateCardProps) {
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
    <View className="bg-card border border-border rounded-xl p-4">
      <View className="flex-row items-start">
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
      </View>

      {/* Action Buttons */}
      <View className="flex-row gap-2 mt-3">
        <Button
          variant="outline"
          size="sm"
          onPress={onFollowAlong}
          className="flex-1 flex-row items-center justify-center gap-2"
        >
          <Icon as={Play} size={16} className="text-foreground" />
          <Text className="text-sm font-medium">Follow Along</Text>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onPress={onRecord}
          className="flex-1 flex-row items-center justify-center gap-2"
        >
          <Icon as={Smartphone} size={16} className="text-foreground" />
          <Text className="text-sm font-medium">Record</Text>
        </Button>
      </View>
    </View>
  );
}
