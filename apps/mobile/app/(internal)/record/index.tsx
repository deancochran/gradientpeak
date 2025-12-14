import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { RecordingCarousel } from "@/components/RecordingCarousel";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useActivityStatus,
  usePlan,
  useRecorderActions,
  useRecordingState,
  useSensors,
} from "@/lib/hooks/useActivityRecorder";
import { useAllPermissionsGranted } from "@/lib/hooks/useStandalonePermissions";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { useRouter } from "expo-router";
import {
  Bluetooth,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Square,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import {
  type CarouselCardConfig,
  type CarouselCardType,
  createDefaultCardsConfig,
} from "types/carousel";

// Helper function to resolve power target
function resolvePowerTarget(target: any, profile: any): number | null {
  if (typeof target === "number") return Math.round(target);
  if (target.type === "%FTP" || target.type === "ftp") {
    const ftp = profile?.ftp || 200;
    return Math.round((target.intensity / 100) * ftp);
  }
  if (target.type === "watts") return Math.round(target.intensity || 0);
  return null;
}

function RecordScreen() {
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);

  // Use shared service from context (provided by _layout.tsx)
  const service = useSharedActivityRecorder();

  // State and actions
  const state = useRecordingState(service);
  const { count: sensorCount } = useSensors(service);
  const plan = usePlan(service);
  const { isOutdoorActivity } = useActivityStatus(service);
  const { start, pause, resume, finish } = useRecorderActions(service);
  const { allGranted: allPermissionsGranted, isLoading: permissionsLoading } =
    useAllPermissionsGranted();

  // Debug: Log permission status changes
  useEffect(() => {
    console.log("[RecordModal] Permission status changed:", {
      allPermissionsGranted,
      permissionsLoading,
    });
  }, [allPermissionsGranted, permissionsLoading]);

  // Initialize from store selection
  useEffect(() => {
    if (!service || isInitialized) return;

    const initializeFromStore = () => {
      try {
        console.log("[RecordModal] Loading selection from store");

        // Get selection from store
        const selection = activitySelectionStore.consumeSelection();
        if (!selection) {
          console.error("[RecordModal] No selection found in store");
          Alert.alert("Error", "No activity selected");
          router.back();
          return;
        }

        console.log("[RecordModal] Selection loaded:", {
          type: selection.type,
          hasPlan: !!selection.plan,
          plannedActivityId: selection.plannedActivityId,
        });

        // Initialize the service based on the selection
        console.log("[RecordModal] Processing selection with service method");
        service.selectActivityFromPayload(selection);

        setIsInitialized(true);
      } catch (error) {
        console.error("[RecordModal] Error initializing from store:", error);
        Alert.alert(
          "Error",
          "Failed to initialize activity. Please try again.",
          [{ text: "OK", onPress: () => router.back() }],
        );
      }
    };

    initializeFromStore();
  }, [service, isInitialized, router]);

  // Handle start action - request permissions if needed, then start
  const handleStart = useCallback(async () => {
    console.log("[RecordModal] Start clicked, checking permissions");
    console.log("[RecordModal] allPermissionsGranted:", allPermissionsGranted);

    if (!allPermissionsGranted) {
      console.log(
        "[RecordModal] Permissions not granted, requesting permissions",
      );

      // Request all permissions inline
      if (!service) {
        Alert.alert("Error", "Service not initialized");
        return;
      }

      try {
        const granted = await service.refreshAndCheckAllPermissions();

        if (!granted) {
          // Still not granted after check, request them
          const { requestPermission } = await import(
            "@/lib/services/permissions-check"
          );

          // Request in sequence
          await requestPermission("bluetooth");
          await requestPermission("location");
          await requestPermission("location-background");

          // Final check
          const finalCheck = await service.refreshAndCheckAllPermissions();

          if (!finalCheck) {
            Alert.alert(
              "Permissions Required",
              "This app requires Bluetooth, Location, and Background Location permissions to record activities. Please enable them in your device settings.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Open Settings",
                  onPress: () =>
                    router.push("/(internal)/(tabs)/settings/permissions"),
                },
              ],
            );
            return;
          }
        }
      } catch (error) {
        console.error("[RecordModal] Error requesting permissions:", error);
        Alert.alert(
          "Error",
          "Failed to request permissions. Please try again.",
        );
        return;
      }
    }

    // All permissions granted, start recording
    console.log("[RecordModal] Permissions granted, starting recording");
    try {
      await start();
      console.log("[RecordModal] Recording started successfully");
    } catch (error) {
      console.error("[RecordModal] Error starting recording:", error);
      Alert.alert("Error", "Failed to start recording. Please try again.");
    }
  }, [allPermissionsGranted, start, service, router]);

  // Handle finish action - navigate immediately
  const handleFinish = useCallback(async () => {
    console.log(
      "[RecordModal] Finish clicked, navigating to submit page immediately",
    );

    // Start the finish process but don't wait for it
    finish();

    // Navigate immediately to submit page
    router.push("/record/submit");
  }, [finish, router]);

  // Debug: Track activity status changes
  useEffect(() => {
    console.log("[RecordModal] Activity status changed:", {
      isOutdoorActivity,
      hasPlan: plan.hasPlan,
    });
  }, [isOutdoorActivity, plan.hasPlan]);

  // Determine which cards to show - reactively updates based on activity status
  // Using configuration object instead of array to prevent ordering issues
  const cardsConfig = useMemo((): Record<
    CarouselCardType,
    CarouselCardConfig
  > => {
    const config = createDefaultCardsConfig();

    // Enable map card for outdoor activities
    config.map.enabled = isOutdoorActivity;
    if (isOutdoorActivity) {
      console.log("[RecordModal] Enabling map card for outdoor activity");
    }

    // Enable plan card when a plan is active
    config.plan.enabled = plan.hasPlan;
    if (plan.hasPlan) {
      console.log("[RecordModal] Enabling plan card");
    }

    // Enable trainer card when a controllable trainer is connected
    const hasControllableTrainer =
      service?.sensorsManager.getControllableTrainer()?.isControllable ?? false;
    config.trainer.enabled = hasControllableTrainer;
    if (hasControllableTrainer) {
      console.log("[RecordModal] Enabling trainer control card");
    }

    console.log(
      "[RecordModal] Cards config updated:",
      Object.values(config)
        .filter((c) => c.enabled)
        .map((c) => c.id),
    );
    return config;
  }, [isOutdoorActivity, plan.hasPlan, service]);

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-muted-foreground">Initializing activity...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Sensor Disconnect Warning */}
      {(() => {
        const disconnectedSensors = service?.sensorsManager
          .getConnectedSensors()
          .filter((s) => s.connectionState === "disconnected");

        if (!disconnectedSensors || disconnectedSensors.length === 0)
          return null;

        return (
          <View className="bg-yellow-500/20 px-4 py-2 border-b border-yellow-500/40">
            <View className="flex-row items-center gap-2">
              <Icon as={AlertTriangle} size={16} className="text-yellow-600" />
              <Text className="text-xs text-yellow-600 font-medium">
                {disconnectedSensors.length} sensor(s) disconnected
              </Text>
            </View>
            <Text className="text-xs text-yellow-600 mt-1">
              {disconnectedSensors.map((s) => s.name).join(", ")} - attempting
              reconnection
            </Text>
          </View>
        );
      })()}

      {/* Trainer Control Indicator */}
      {(() => {
        const trainer = service?.sensorsManager.getControllableTrainer();
        const currentStep = service?.currentStep;

        if (!trainer || !trainer.isControllable) return null;

        let targetDisplay = "Connected";
        if (currentStep?.targets?.power) {
          const powerTarget = resolvePowerTarget(
            currentStep.targets.power,
            service?.recordingMetadata?.profile,
          );
          if (powerTarget) {
            targetDisplay = `Target: ${powerTarget}W`;
          }
        } else if (currentStep?.targets?.grade !== undefined) {
          targetDisplay = `Target: ${currentStep.targets.grade}%`;
        }

        return (
          <View className="bg-primary/10 px-4 py-2 border-b border-primary/20">
            <View className="flex-row items-center gap-2">
              <Icon as={Zap} size={16} className="text-primary" />
              <Text className="text-xs text-primary font-medium">
                Trainer Control Active
              </Text>
              <Text className="text-xs text-primary ml-auto">
                {targetDisplay}
              </Text>
            </View>
          </View>
        );
      })()}

      {/* Carousel - Now takes full height */}
      <RecordingCarousel
        cardsConfig={cardsConfig}
        service={service}
        onCardChange={(cardId) => {
          console.log("[RecordModal] User switched to card:", cardId);
        }}
      />
      {/* Footer */}
      <View className="bg-background px-4">
        <View className="flex-row gap-3">
          {state === "pending" && (
            <Button
              size="icon"
              variant="outline"
              className="h-14 w-14 rounded-xl"
              onPress={() => router.back()}
            >
              <Icon as={ChevronLeft} size={24} />
            </Button>
          )}
          {state === "pending" && (
            <Button onPress={handleStart} className="flex-1 h-14 rounded-xl">
              <Icon as={Play} size={24} className="color-background" />
              <Text className=" font-semibold text-lg">Start </Text>
            </Button>
          )}

          {state === "recording" && (
            <Button onPress={pause} className="flex-1 h-14 rounded-xl">
              <Icon as={Pause} size={24} className="color-background" />
              <Text className="ml-3 font-semibold text-lg">Pause</Text>
            </Button>
          )}

          {state === "recording" && plan.hasPlan && plan.canAdvance && (
            <Button
              onPress={plan.advance}
              variant="outline"
              className="w-full h-12 rounded-xl"
            >
              <Icon as={ChevronRight} size={20} />
              <Text className="ml-2 font-medium">Next Step</Text>
            </Button>
          )}
          {state === "paused" && (
            <Button
              variant="secondary"
              onPress={resume}
              className="flex-1 h-14 rounded-xl"
            >
              <Icon as={Play} size={24} />
              <Text className="ml-3 font-semibold">Resume</Text>
            </Button>
          )}
          {state === "paused" && (
            <Button
              onPress={handleFinish}
              variant="secondary"
              className="flex-1 h-14 rounded-xl"
            >
              <Icon as={Square} size={24} />
              <Text className="ml-3 font-semibold">Finish</Text>
            </Button>
          )}

          <Button
            size="icon"
            variant="outline"
            className="h-14 w-14 rounded-xl"
            onPress={() => router.push("/record/sensors")}
          >
            <Icon as={Bluetooth} size={24} />
          </Button>
        </View>
      </View>
    </View>
  );
}

export default function RecordScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <RecordScreen />
    </ErrorBoundary>
  );
}
