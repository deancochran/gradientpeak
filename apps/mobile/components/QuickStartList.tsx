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
  ChevronRight,
  Dumbbell,
  Footprints,
  Waves,
} from "lucide-react-native";
import { View } from "react-native";

interface QuickStartListProps {
  onActivitySelect: (
    category: PublicActivityCategory,
    location: PublicActivityLocation,
  ) => void;
}

// Activity configurations
const ACTIVITY_CONFIGS: {
  category: PublicActivityCategory;
  location: PublicActivityLocation;
  icon: any;
  color: string;
  description: string;
}[] = [
  {
    category: "run",
    location: "outdoor",
    icon: Footprints,
    color: "text-emerald-600",
    description: "GPS tracking, pace analysis",
  },
  {
    category: "bike",
    location: "outdoor",
    icon: Bike,
    color: "text-blue-600",
    description: "GPS tracking, speed & elevation",
  },
  {
    category: "bike",
    location: "indoor",
    icon: Bike,
    color: "text-orange-600",
    description: "Power & cadence tracking",
  },
  {
    category: "run",
    location: "indoor",
    icon: Footprints,
    color: "text-purple-600",
    description: "Pace & incline tracking",
  },
  {
    category: "strength",
    location: "indoor",
    icon: Dumbbell,
    color: "text-red-600",
    description: "Sets, reps & weight tracking",
  },
  {
    category: "swim",
    location: "indoor",
    icon: Waves,
    color: "text-cyan-600",
    description: "Distance & stroke tracking",
  },
  {
    category: "other",
    location: "outdoor",
    icon: Activity,
    color: "text-gray-600",
    description: "Basic time & heart rate",
  },
];

export function QuickStartList({ onActivitySelect }: QuickStartListProps) {
  return (
    <View className="gap-3">
      {ACTIVITY_CONFIGS.map((config, index) => (
        <ActivityCard
          key={`${config.category}-${config.location}-${index}`}
          config={config}
          onSelect={() => onActivitySelect(config.category, config.location)}
        />
      ))}
    </View>
  );
}

interface ActivityCardProps {
  config: (typeof ACTIVITY_CONFIGS)[0];
  onSelect: () => void;
}

function ActivityCard({ config, onSelect }: ActivityCardProps) {
  return (
    <Button
      variant="outline"
      onPress={onSelect}
      className="h-auto p-4 flex-row items-center justify-start bg-card border border-border rounded-xl"
    >
      <View className="mr-4">
        <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
          <Icon as={config.icon} size={24} className={config.color} />
        </View>
      </View>

      <View className="flex-1">
        <Text className="text-lg font-semibold mb-1">
          {getActivityDisplayName(config.category, config.location)}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {config.description}
        </Text>
      </View>

      <View className="ml-2">
        <Icon as={ChevronRight} size={20} className="text-muted-foreground" />
      </View>
    </Button>
  );
}
