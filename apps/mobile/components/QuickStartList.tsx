import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { getActivityDisplayName } from "@repo/core";
import type { PublicActivityCategory } from "@repo/supabase";
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
    gpsRecordingEnabled: boolean,
  ) => void;
}

// Activity configurations
const ACTIVITY_CONFIGS: {
  category: PublicActivityCategory;
  gpsRecordingEnabled: boolean;
  icon: any;
  color: string;
  description: string;
}[] = [
  {
    category: "run",
    gpsRecordingEnabled: true,
    icon: Footprints,
    color: "text-emerald-600",
    description: "GPS tracking, pace analysis",
  },
  {
    category: "bike",
    gpsRecordingEnabled: true,
    icon: Bike,
    color: "text-blue-600",
    description: "GPS tracking, speed & elevation",
  },
  {
    category: "bike",
    gpsRecordingEnabled: false,
    icon: Bike,
    color: "text-orange-600",
    description: "Power & cadence tracking",
  },
  {
    category: "run",
    gpsRecordingEnabled: false,
    icon: Footprints,
    color: "text-purple-600",
    description: "Pace & incline tracking",
  },
  {
    category: "strength",
    gpsRecordingEnabled: false,
    icon: Dumbbell,
    color: "text-red-600",
    description: "Sets, reps & weight tracking",
  },
  {
    category: "swim",
    gpsRecordingEnabled: false,
    icon: Waves,
    color: "text-cyan-600",
    description: "Distance & stroke tracking",
  },
  {
    category: "other",
    gpsRecordingEnabled: true,
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
          key={`${config.category}-${config.gpsRecordingEnabled}-${index}`}
          config={config}
          onSelect={() =>
            onActivitySelect(config.category, config.gpsRecordingEnabled)
          }
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
          {getActivityDisplayName(config.category, config.gpsRecordingEnabled)}
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
