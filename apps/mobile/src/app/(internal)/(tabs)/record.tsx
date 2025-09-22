import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { Text } from "@/components/ui/text";
import {
  ACTIVITY_TYPES,
  ActivityTypeId,
  getPopularActivityTypes,
} from "@repo/core";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

// TODO: Move to core types
interface PlannedActivity {
  id: string;
  name: string;
  type: string;
  duration: string;
  time: string;
  description: string;
}

// TODO: Move to core types
interface Device {
  id: string;
  name: string;
  type: string;
}

interface PermissionsState {
  location: boolean;
  backgroundLocation: boolean;
  bluetooth: boolean;
}

interface RecordSelectionState {
  mode: "planned" | "unplanned" | null;
  selectedActivityType: ActivityTypeId | null;
  plannedActivityId: string | null;
  permissions: PermissionsState;
  connectedDevices: string[];
  setupComplete: boolean;
}

const popularActivityTypes = getPopularActivityTypes();

// TODO: Replace with actual planned activities from a data source
const PLANNED_ACTIVITIES: PlannedActivity[] = [
  {
    id: "1",
    name: "Morning Run",
    type: "outdoor_run",
    duration: "30 min",
    time: "7:00 AM",
    description: "Easy pace recovery run",
  },
  {
    id: "2",
    name: "Strength Training",
    type: "strength_training",
    duration: "45 min",
    time: "6:00 PM",
    description: "Upper body focus",
  },
  {
    id: "3",
    name: "Evening Ride",
    type: "road_cycling",
    duration: "60 min",
    time: "5:30 PM",
    description: "Hill intervals",
  },
];

// Custom hook for record selection state
function useRecordSelection() {
  const [state, setState] = useState<RecordSelectionState>({
    mode: null,
    selectedActivityType: null,
    plannedActivityId: null,
    permissions: {
      location: false,
      backgroundLocation: false,
      bluetooth: false,
    },
    connectedDevices: [],
    setupComplete: false,
  });

  // Reset state on mount (simulating tab focus reset)
  useEffect(() => {
    setState({
      mode: null,
      selectedActivityType: null,
      plannedActivityId: null,
      permissions: {
        location: false,
        backgroundLocation: false,
        bluetooth: false,
      },
      connectedDevices: [],
      setupComplete: false,
    });
  }, []);

  const setMode = (mode: "planned" | "unplanned" | null) => {
    setState((prev) => ({ ...prev, mode }));
  };

  const setActivityType = (activityType: ActivityTypeId | null) => {
    setState((prev) => ({ ...prev, selectedActivityType: activityType }));
  };

  const setPlannedActivity = (activityId: string | null) => {
    const activity = PLANNED_ACTIVITIES.find((a) => a.id === activityId);
    setState((prev) => ({
      ...prev,
      plannedActivityId: activityId,
      selectedActivityType: activity?.type as ActivityTypeId | null,
    }));
  };

  const setPermissions = (permissions: Partial<PermissionsState>) => {
    setState((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, ...permissions },
    }));
  };

  const addConnectedDevice = (device: string) => {
    setState((prev) => ({
      ...prev,
      connectedDevices: [...prev.connectedDevices, device],
    }));
  };

  const reset = () => {
    setState({
      mode: null,
      selectedActivityType: null,
      plannedActivityId: null,
      permissions: {
        location: false,
        backgroundLocation: false,
        bluetooth: false,
      },
      connectedDevices: [],
      setupComplete: false,
    });
  };

  return {
    ...state,
    setMode,
    setActivityType,
    setPlannedActivity,
    setPermissions,
    addConnectedDevice,
    reset,
  };
}

// Helper functions
function requiresPermissions(activityTypeId: ActivityTypeId | null) {
  if (!activityTypeId) return false;
  const activity = ACTIVITY_TYPES[activityTypeId];
  return (
    activity.recordingConstraints.requiresGPS ||
    activity.recordingConstraints.recommendsHeartRate
  );
}

function requiresBluetooth(activityTypeId: ActivityTypeId | null) {
  if (!activityTypeId) return false;
  const activity = ACTIVITY_TYPES[activityTypeId];
  return activity.recordingConstraints.recommendsHeartRate;
}

// Step Components
function ActivityModeStep({
  onSelectMode,
}: {
  onSelectMode: (mode: "planned" | "unplanned") => void;
}) {
  return (
    <View className="px-6 py-4">
      <Text className="text-center text-muted-foreground mb-8">
        How would you like to start your activity?
      </Text>

      <View className="gap-4">
        <Button
          onPress={() => onSelectMode("planned")}
          className="flex-row items-center p-6 min-h-20"
          variant={"outline"}
        >
          <View className="flex-1">
            <Text className="text-lg font-semibold text-foreground mb-1">
              Planned Workout
            </Text>
            <Text className="text-sm text-muted-foreground">
              Follow your scheduled training plan
            </Text>
          </View>
        </Button>

        <Button
          onPress={() => onSelectMode("unplanned")}
          className="flex-row items-center p-6 min-h-20"
          variant={"outline"}
        >
          <View className="flex-1">
            <Text className="text-lg font-semibold text-foreground mb-1">
              Quick Start
            </Text>
            <Text className="text-sm text-muted-foreground">
              Start an activity right now
            </Text>
          </View>
        </Button>
      </View>
    </View>
  );
}

function PlannedActivityStep({
  onSelectActivity,
}: {
  onSelectActivity: (activityId: string) => void;
}) {
  return (
    <ScrollView className="flex-1 px-6">
      <Text className="text-center text-muted-foreground mb-6">
        Select from your scheduled activities
      </Text>

      <View className="gap-3">
        {PLANNED_ACTIVITIES.map((activity) => (
          <Button
            key={activity.id}
            onPress={() => onSelectActivity(activity.id)}
            className="p-5"
          >
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-base font-semibold text-foreground">
                {activity.name}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {activity.time}
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground mb-2">
              {activity.description}
            </Text>
            <View className="flex-row items-center">
              <Text className="text-sm text-muted-foreground">
                {activity.duration}
              </Text>
            </View>
          </Button>
        ))}
      </View>
    </ScrollView>
  );
}

function UnplannedActivityStep({
  onSelectActivity,
}: {
  onSelectActivity: (activityId: ActivityTypeId) => void;
}) {
  return (
    <View className="px-6 py-4">
      <Text className="text-center text-muted-foreground mb-6">
        Choose your activity type
      </Text>

      <View className="gap-4">
        {popularActivityTypes.map((activity) => {
          return (
            <Button
              key={activity.id}
              onPress={() => onSelectActivity(activity.id)}
              className="p-6 flex-row items-center min-h-20"
            >
              <View className="flex-1">
                <Text className="text-lg font-semibold text-foreground mb-1">
                  {activity.name}
                </Text>
                <View className="flex-row gap-3">
                  {activity.recordingConstraints.recommendsGPS && (
                    <View className="flex-row items-center">
                      <Text className="text-xs text-muted-foreground">GPS</Text>
                    </View>
                  )}
                  {activity.recordingConstraints.recommendsHeartRate && (
                    <View className="flex-row items-center">
                      <Text className="text-xs text-muted-foreground">
                        Sensors
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </Button>
          );
        })}
      </View>
    </View>
  );
}

function PermissionsStep({
  activityType,
  onComplete,
}: {
  activityType: ActivityTypeId | null;
  onComplete: (permissions: { location: boolean; bluetooth: boolean }) => void;
}) {
  const [permissionsState, setPermissionsState] = useState({
    location: false,
    bluetooth: false,
  });

  const activity = activityType ? ACTIVITY_TYPES[activityType] : null;
  const needsLocation = activity?.recordingConstraints.requiresGPS;
  const needsBluetooth = activity?.recordingConstraints.recommendsHeartRate;

  const handleLocationPermission = () => {
    console.log("show permissions");
    // Simulate permission granted
    setPermissionsState((prev) => ({ ...prev, location: true }));
  };

  const handleBluetoothPermission = () => {
    console.log("show permissions");
    // Simulate permission granted
    setPermissionsState((prev) => ({ ...prev, bluetooth: true }));
  };

  const allPermissionsGranted =
    (!needsLocation || permissionsState.location) &&
    (!needsBluetooth || permissionsState.bluetooth);

  useEffect(() => {
    if (allPermissionsGranted) {
      onComplete(permissionsState);
    }
  }, [allPermissionsGranted, permissionsState, onComplete]);

  return (
    <View className="px-6 py-4">
      <Text className="text-center text-muted-foreground mb-8">
        {activity?.name} needs the following permissions to track your activity
        accurately
      </Text>

      <View className="gap-4">
        {needsLocation && (
          <Card
            className={
              permissionsState.location
                ? "border-success bg-success/10"
                : "border-border"
            }
          >
            <CardContent className="p-5">
              <View className="flex-row items-center mb-3">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">
                    Location Access
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    For GPS tracking and route mapping
                  </Text>
                </View>
              </View>
              {!permissionsState.location && (
                <Button onPress={handleLocationPermission} className="w-full">
                  <Text className="text-primary-foreground">
                    Grant Location Permission
                  </Text>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {needsBluetooth && (
          <Card
            className={
              permissionsState.bluetooth
                ? "border-success bg-success/10"
                : "border-border"
            }
          >
            <CardContent className="p-5">
              <View className="flex-row items-center mb-3">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">
                    Bluetooth Access
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    For heart rate monitors and sensors
                  </Text>
                </View>
              </View>
              {!permissionsState.bluetooth && (
                <Button onPress={handleBluetoothPermission} className="w-full">
                  <Text className="text-primary-foreground">
                    Grant Bluetooth Permission
                  </Text>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </View>
    </View>
  );
}

function BluetoothStep({
  onComplete,
  onSkip,
}: {
  activityType: ActivityTypeId | null;
  onComplete: (devices: string[]) => void;
  onSkip: () => void;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);

  const handleScan = () => {
    console.log("show ble");
    setScanning(true);

    // Simulate device discovery
    setTimeout(() => {
      setDevices([
        { id: "hr-001", name: "Polar H10", type: "Heart Rate" },
        { id: "bike-002", name: "Wahoo Cadence", type: "Cycling Sensor" },
      ]);
      setScanning(false);
    }, 2000);
  };

  const handleConnect = (deviceId: string) => {
    console.log("show ble");
    setConnected((prev: string[]) => [...prev, deviceId]);
    onComplete([deviceId]);
  };

  return (
    <View className="px-6 py-4">
      <Text className="text-center text-muted-foreground mb-8">
        Connect your fitness devices for better tracking
      </Text>

      <View className="gap-4">
        <Button
          onPress={handleScan}
          disabled={scanning}
          variant="outline"
          className="w-full"
        >
          <Text className="text-primary">
            {scanning ? "Scanning..." : "Scan for Devices"}
          </Text>
        </Button>

        {devices.map((device) => (
          <Card key={device.id} className="border-border">
            <CardContent className="p-4">
              <View className="flex-row justify-between items-center">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">
                    {device.name}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {device.type}
                  </Text>
                </View>
                {connected.includes(device.id) ? (
                  <View className="flex-row items-center">
                    <Text className="text-sm text-success font-medium">
                      Connected
                    </Text>
                  </View>
                ) : (
                  <Button
                    onPress={() => handleConnect(device.id)}
                    size="sm"
                    variant="secondary"
                  >
                    <Text className="text-secondary-foreground">Connect</Text>
                  </Button>
                )}
              </View>
            </CardContent>
          </Card>
        ))}

        <Pressable
          onPress={onSkip}
          className="py-4 items-center active:opacity-70"
        >
          <Text className="text-base text-muted-foreground">Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReadyStep({
  activityType,
  mode,
  plannedActivityId,
  connectedDevices,
  permissions,
}: {
  activityType: ActivityTypeId | null;
  mode: "planned" | "unplanned" | null;
  plannedActivityId: string | null;
  connectedDevices: string[];
  permissions: PermissionsState;
}) {
  const activity = activityType ? ACTIVITY_TYPES[activityType] : null;
  const plannedActivity = PLANNED_ACTIVITIES.find(
    (a) => a.id === plannedActivityId,
  );

  return (
    <ScrollView className="flex-1 px-6 py-4">
      <View className="items-center mb-8">
        <Text className="text-2xl font-bold text-foreground text-center mb-2">
          Ready to Start!
        </Text>
        <Text className="text-muted-foreground text-center">
          Everything is set up for your {activity?.name.toLowerCase()}
        </Text>
      </View>

      <View className="gap-4">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Activity Details</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-2">
              <View className="flex-row items-center">
                <Text className="text-foreground">
                  {mode === "planned" && plannedActivity
                    ? plannedActivity.name
                    : activity?.name}
                </Text>
              </View>
              {mode === "planned" && plannedActivity && (
                <View className="flex-row items-center">
                  <Text className="text-foreground">
                    {plannedActivity.duration}
                  </Text>
                </View>
              )}
            </View>
          </CardContent>
        </Card>

        {(permissions?.location || permissions?.bluetooth) && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Permissions</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-2">
                {permissions.location && (
                  <View className="flex-row items-center">
                    <Text className="text-foreground">
                      Location tracking enabled
                    </Text>
                  </View>
                )}
                {permissions.bluetooth && (
                  <View className="flex-row items-center">
                    <Text className="text-foreground">
                      Bluetooth sensors enabled
                    </Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {connectedDevices.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Connected Devices</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-2">
                {connectedDevices.map((deviceId: string, index: number) => (
                  <View key={index} className="flex-row items-center">
                    <Text className="text-foreground">Device {deviceId}</Text>
                  </View>
                ))}
              </View>
            </CardContent>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

// Main Record Page Component
export default function RecordScreen() {
  const selection = useRecordSelection();
  const router = useRouter();

  // Step validation function
  const validateStep = (step: number) => {
    switch (step) {
      case 0: // Activity Mode Selection
        return selection.mode !== null;
      case 1: // Activity Selection
        return selection.selectedActivityType !== null;
      case 2: // Permissions
        return (
          !requiresPermissions(selection.selectedActivityType) ||
          (selection.permissions.location && selection.permissions.bluetooth)
        );
      case 3: // Bluetooth
        return (
          !requiresBluetooth(selection.selectedActivityType) ||
          selection.connectedDevices.length > 0
        );
      default:
        return true;
    }
  };

  const handleActivitySelect = (activityId: string) => {
    if (selection.mode === "planned") {
      selection.setPlannedActivity(activityId);
    } else {
      selection.setActivityType(activityId as ActivityTypeId);
    }
  };

  const handlePermissionsComplete = (permissions: {
    location: boolean;
    bluetooth: boolean;
  }) => {
    selection.setPermissions(permissions);
  };

  const handleBluetoothComplete = (devices: string[]) => {
    devices.forEach((device) => selection.addConnectedDevice(device));
  };

  const handleBluetoothSkip = () => {
    // Continue without devices
  };

  const handleComplete = () => {
    // Navigate to recording screen
    router.push("/(internal)/recording");

    // Reset for next time
    selection.reset();
  };

  return (
    <View className="flex-1 bg-background">
      <Stepper
        onComplete={handleComplete}
        footer={({
          currentStep,
          goToNext,
          canGoPrev,
          goToPrev,
          isLastStep,
        }) => (
          <View className="p-6 border-t border-border">
            <View className="flex-row justify-between">
              {canGoPrev ? (
                <Button variant="outline" onPress={goToPrev}>
                  <Text>Back</Text>
                </Button>
              ) : (
                <View />
              )}

              <Button onPress={goToNext} disabled={!validateStep(currentStep)}>
                <Text>{isLastStep ? "Start" : "Next"}</Text>
              </Button>
            </View>
          </View>
        )}
      >
        <Stepper.Step>
          <ActivityModeStep onSelectMode={selection.setMode} />
        </Stepper.Step>

        <Stepper.Step>
          {selection.mode === "planned" ? (
            <PlannedActivityStep onSelectActivity={handleActivitySelect} />
          ) : (
            <UnplannedActivityStep onSelectActivity={handleActivitySelect} />
          )}
        </Stepper.Step>

        <Stepper.Step>
          <PermissionsStep
            activityType={selection.selectedActivityType}
            onComplete={handlePermissionsComplete}
          />
        </Stepper.Step>

        <Stepper.Step>
          <BluetoothStep
            activityType={selection.selectedActivityType}
            onComplete={handleBluetoothComplete}
            onSkip={handleBluetoothSkip}
          />
        </Stepper.Step>

        <Stepper.Step>
          <ReadyStep
            activityType={selection.selectedActivityType}
            mode={selection.mode}
            plannedActivityId={selection.plannedActivityId}
            connectedDevices={selection.connectedDevices}
            permissions={selection.permissions}
          />
        </Stepper.Step>
      </Stepper>
    </View>
  );
}
