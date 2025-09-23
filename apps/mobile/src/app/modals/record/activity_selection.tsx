import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { CheckCircle, ChevronLeft } from "lucide-react-native";
import { ScrollView, View } from "react-native";
export default function ActivitySelectionModal() {
  const { currentActivity, setActivity } = useRecording();
  const [mode, setMode] = useState<"planned" | "unplanned">("unplanned");
  const [selectedType, setSelectedType] =
    useState<PublicActivityType>("outdoor_run");
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" onPress={() => router.back()}>
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
            onPress={() => setMode("unplanned")}
            className={`flex-1 py-2 rounded-md items-center ${mode === "unplanned" ? "bg-primary" : ""}`}
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
            onPress={() => setMode("planned")}
            className={`flex-1 py-2 rounded-md items-center ${mode === "planned" ? "bg-primary" : ""}`}
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
            onSelectPlanned={(id, type) => {
              setActivity({ id, type, mode: "planned" });
              router.back();
            }}
          />
        )}
      </ScrollView>

      {/* Footer Actions (for unplanned mode) */}
      {mode === "unplanned" && (
        <View className="border-t border-border p-4">
          <Button
            onPress={() => {
              setActivity({ type: selectedType, mode: "unplanned" });
              router.back();
            }}
            className="w-full"
          >
            <Text className="font-semibold">
              Select {ACTIVITY_NAMES[selectedType]}
            </Text>
          </Button>
        </View>
      )}
    </View>
  );
}

// Activity type grid component
const UnplannedActivitySelection = ({ selectedType, onSelectType }) => (
  <View className="py-4">
    <Text className="text-muted-foreground mb-4">
      Choose your activity type
    </Text>
    <View className="gap-3">
      {Object.entries(ACTIVITY_NAMES).map(([type, name]) => (
        <Button
          key={type}
          onPress={() => onSelectType(type)}
          className={`p-4 rounded-lg border ${selectedType === type ? "border-primary bg-primary/10" : "border-border bg-background"}`}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-semibold mb-1">{name}</Text>
              <View className="flex-row gap-2">
                {ACTIVITY_BADGES[type].gps && (
                  <View className="px-2 py-1 bg-blue-500/10 rounded-full">
                    <Text className="text-xs text-blue-600">GPS</Text>
                  </View>
                )}
                {ACTIVITY_BADGES[type].bt && (
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
