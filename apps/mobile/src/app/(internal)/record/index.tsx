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
import {
  type CarouselCardConfig,
  type CarouselCardType,
  createDefaultCardsConfig,
} from "@/types/carousel";
import { useRouter } from "expo-router";
import {
  Bluetooth,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Square,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";

export default function RecordModal() {
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
  const { allGranted: allPermissionsGranted } = useAllPermissionsGranted();

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

  // Handle start action - check permissions first
  const handleStart = useCallback(async () => {
    console.log("[RecordModal] Start clicked, checking permissions");

    if (!allPermissionsGranted) {
      Alert.alert(
        "Permissions Required",
        "All permissions (Bluetooth, Location, and Background Location) are required to start recording activities. Please grant all permissions before starting.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Manage Permissions",
            onPress: () => router.push("/(internal)/permissions"),
          },
        ],
      );
      return;
    }

    // All permissions granted, start recording
    await start();
  }, [allPermissionsGranted, start, router]);

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

    console.log(
      "[RecordModal] Cards config updated:",
      Object.values(config)
        .filter((c) => c.enabled)
        .map((c) => c.id),
    );
    return config;
  }, [isOutdoorActivity, plan.hasPlan]);

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
      {/* Floating Close Button - Only shown when pending */}
      {state === "pending" && (
        <View className="absolute top-2 left-2 z-50">
          <Button
            size="icon"
            variant="ghost"
            onPress={() => router.back()}
            className="bg-muted text-muted-foreground/80 "
          >
            <Icon as={ChevronDown} size={24} />
          </Button>
        </View>
      )}
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
            <Button onPress={handleStart} className="flex-1 h-14 rounded-xl">
              <Icon as={Play} size={24} className="color-background" />
              <Text className="ml-3 font-semibold text-lg">Start Activity</Text>
            </Button>
          )}

          {state === "recording" && (
            <Button
              onPress={pause}
              variant="secondary"
              className="w-full h-14 rounded-xl"
            >
              <Icon as={Pause} size={24} />
              <Text className="ml-3 font-semibold">Pause Activity</Text>
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
