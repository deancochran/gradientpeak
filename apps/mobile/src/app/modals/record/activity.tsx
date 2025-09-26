import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useActivityRecorder } from "@/lib/hooks/useActivityRecorder";
import { PublicActivityType } from "@repo/core";
import { useRouter } from "expo-router";
import { CheckCircle, ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";

// ===== ACTIVITY TYPE DEFINITIONS =====
type ActivityMode = "planned" | "unplanned";

const ACTIVITY_NAMES: Record<PublicActivityType, string> = {
  outdoor_run: "Outdoor Run",
  indoor_run: "Indoor Run",
  outdoor_bike: "Outdoor Cycling",
  indoor_bike: "Indoor Cycling",
  walk: "Walking",
  hike: "Hiking",
  swim: "Swimming",
  other: "Other Activity",
};

const ACTIVITY_BADGES: Record<
  PublicActivityType,
  { gps: boolean; bt: boolean }
> = {
  outdoor_run: { gps: true, bt: true },
  indoor_run: { gps: false, bt: true },
  outdoor_bike: { gps: true, bt: true },
  indoor_bike: { gps: false, bt: true },
  walk: { gps: true, bt: false },
  hike: { gps: true, bt: false },
  swim: { gps: true, bt: false },
  other: { gps: false, bt: false },
};

export default function ActivitySelectionModal() {
  const { startRecording, state } = useActivityRecorder();
  const [mode, setMode] = useState<ActivityMode>("unplanned");
  const [selectedType, setSelectedType] =
    useState<PublicActivityType>("outdoor_run");
  const [selectedPlanned, setSelectedPlanned] = useState<string | null>(null);
  const router = useRouter();

  const handleSelectActivity = async () => {
    try {
      let success = false;

      if (mode === "planned" && selectedPlanned) {
        // For now, just start with activity type since we need to fetch planned activity
        // TODO: Integrate with actual planned activities from backend
        success = await startRecording(selectedType);
      } else {
        // Start unplanned activity
        success = await startRecording(selectedType);
      }

      if (success) {
        router.back(); // Return to main recording screen
      } else {
        // Error handling is done in the hook
        console.error("Failed to start activity");
      }
    } catch (error) {
      console.error("Error starting activity:", error);
    }
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" variant="ghost" onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">
          Select Activity
        </Text>
        <View className="w-10" />
      </View>

      {/* Mode Selection Tabs */}
      <View className="px-4 py-3 bg-muted/50">
        <View className="flex-row bg-background rounded-lg p-1">
          <Button
            variant={mode === "unplanned" ? "default" : "ghost"}
            onPress={() => setMode("unplanned")}
            className="flex-1"
          >
            <Text
              className={
                mode === "unplanned"
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }
            >
              Quick Start
            </Text>
          </Button>
          <Button
            variant={mode === "planned" ? "default" : "ghost"}
            onPress={() => setMode("planned")}
            className="flex-1"
          >
            <Text
              className={
                mode === "planned"
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }
            >
              Planned Workout
            </Text>
          </Button>
        </View>
      </View>

      {/* Content Area */}
      <ScrollView className="flex-1 px-4">
        {mode === "unplanned" ? (
          <UnplannedActivitySelection
            selectedType={selectedType}
            onSelectType={setSelectedType}
          />
        ) : (
          <PlannedActivitySelection
            selectedType={selectedType}
            selectedPlanned={selectedPlanned}
            onSelectType={setSelectedType}
            onSelectPlanned={setSelectedPlanned}
          />
        )}
      </ScrollView>

      {/* Footer Actions */}
      <View className="border-t border-border p-4">
        <Button
          onPress={handleSelectActivity}
          className="w-full"
          disabled={state !== "pending"}
        >
          <Text className="font-semibold">
            {mode === "planned" && selectedPlanned
              ? "Start Planned Workout"
              : `Start ${ACTIVITY_NAMES[selectedType]}`}
          </Text>
        </Button>
        {state !== "pending" && (
          <Text className="text-center text-sm text-muted-foreground mt-2">
            Complete current recording to start a new one
          </Text>
        )}
      </View>
    </View>
  );
}

// ===== ACTIVITY TYPE SELECTION COMPONENT =====
const UnplannedActivitySelection = ({
  selectedType,
  onSelectType,
}: {
  selectedType: PublicActivityType;
  onSelectType: (type: PublicActivityType) => void;
}) => (
  <View className="py-4">
    <Text className="text-lg font-semibold mb-2">Choose Activity Type</Text>
    <Text className="text-muted-foreground mb-4">
      Select the type of activity you want to record
    </Text>
    <View className="gap-3">
      {Object.entries(ACTIVITY_NAMES).map(([type, name]) => (
        <Button
          key={type}
          variant="ghost"
          onPress={() => onSelectType(type as PublicActivityType)}
          className={`p-4 rounded-lg border justify-start ${
            selectedType === type
              ? "border-primary bg-primary/10"
              : "border-border bg-background"
          }`}
        >
          <View className="flex-row items-center justify-between w-full">
            <View className="flex-1">
              <Text className="font-semibold mb-1">{name}</Text>
              <View className="flex-row gap-2">
                {ACTIVITY_BADGES[type as PublicActivityType].gps && (
                  <View className="px-2 py-1 bg-blue-500/10 rounded-full">
                    <Text className="text-xs text-blue-600">GPS</Text>
                  </View>
                )}
                {ACTIVITY_BADGES[type as PublicActivityType].bt && (
                  <View className="px-2 py-1 bg-purple-500/10 rounded-full">
                    <Text className="text-xs text-purple-600">Sensors</Text>
                  </View>
                )}
              </View>
            </View>
            {selectedType === type && (
              <Icon as={CheckCircle} size={20} className="text-primary" />
            )}
          </View>
        </Button>
      ))}
    </View>
  </View>
);

// ===== PLANNED ACTIVITY SELECTION COMPONENT =====
const PlannedActivitySelection = ({
  selectedType,
  selectedPlanned,
  onSelectType,
  onSelectPlanned,
}: {
  selectedType: PublicActivityType;
  selectedPlanned: string | null;
  onSelectType: (type: PublicActivityType) => void;
  onSelectPlanned: (id: string | null) => void;
}) => (
  <View className="py-4">
    <Text className="text-lg font-semibold mb-2">Planned Workouts</Text>
    <Text className="text-muted-foreground mb-4">
      Choose from your scheduled workouts
    </Text>

    {/* Activity Type Selection for Planned */}
    <View className="mb-6">
      <Text className="font-medium mb-2">Activity Type</Text>
      <View className="flex-row flex-wrap gap-2">
        {Object.entries(ACTIVITY_NAMES).map(([type, name]) => (
          <Button
            key={type}
            variant={selectedType === type ? "default" : "outline"}
            size="sm"
            onPress={() => onSelectType(type as PublicActivityType)}
            className="min-w-0"
          >
            <Text
              className={`text-xs ${selectedType === type ? "text-primary-foreground" : "text-foreground"}`}
            >
              {name}
            </Text>
          </Button>
        ))}
      </View>
    </View>

    {/* Planned Workouts List */}
    <View className="gap-3">
      <Text className="font-medium">Available Workouts</Text>

      {/* TODO: Replace with actual planned workouts from service */}
      <MockPlannedWorkouts
        activityType={selectedType}
        selectedId={selectedPlanned}
        onSelect={onSelectPlanned}
      />
    </View>
  </View>
);

// ===== MOCK PLANNED WORKOUTS (Replace with actual data) =====
const MockPlannedWorkouts = ({
  activityType,
  selectedId,
  onSelect,
}: {
  activityType: PublicActivityType;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) => {
  // Mock planned workouts based on activity type
  const mockWorkouts = [
    {
      id: "workout-1",
      name: `${ACTIVITY_NAMES[activityType]} Intervals`,
      description: "5 x 3min intervals with 2min rest",
      duration: "35 minutes",
      type: activityType,
    },
    {
      id: "workout-2",
      name: `Easy ${ACTIVITY_NAMES[activityType]}`,
      description: "Steady speed endurance session",
      duration: "45 minutes",
      type: activityType,
    },
    {
      id: "workout-3",
      name: `${ACTIVITY_NAMES[activityType]} Tempo`,
      description: "20min tempo with warm up and cool down",
      duration: "40 minutes",
      type: activityType,
    },
  ];

  return (
    <View className="gap-3">
      {mockWorkouts.map((workout) => (
        <Button
          key={workout.id}
          variant="ghost"
          onPress={() =>
            onSelect(selectedId === workout.id ? null : workout.id)
          }
          className={`p-4 rounded-lg border justify-start ${
            selectedId === workout.id
              ? "border-primary bg-primary/10"
              : "border-border bg-background"
          }`}
        >
          <View className="flex-row items-center justify-between w-full">
            <View className="flex-1">
              <Text className="font-semibold mb-1">{workout.name}</Text>
              <Text className="text-sm text-muted-foreground mb-1">
                {workout.description}
              </Text>
              <View className="flex-row gap-2">
                <View className="px-2 py-1 bg-muted rounded-full">
                  <Text className="text-xs text-muted-foreground">
                    {workout.duration}
                  </Text>
                </View>
              </View>
            </View>
            {selectedId === workout.id && (
              <Icon as={CheckCircle} size={20} className="text-primary" />
            )}
          </View>
        </Button>
      ))}

      {mockWorkouts.length === 0 && (
        <View className="p-8 items-center border-2 border-dashed border-muted-foreground/20 rounded-lg">
          <Text className="text-muted-foreground text-center">
            No planned workouts found for {ACTIVITY_NAMES[activityType]}
          </Text>
          <Text className="text-xs text-muted-foreground text-center mt-2">
            Create workouts in the training plan section
          </Text>
        </View>
      )}
    </View>
  );
};
