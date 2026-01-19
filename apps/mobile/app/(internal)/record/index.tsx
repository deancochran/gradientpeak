import { ActivitySelectionModal } from "@/components/ActivitySelectionModal";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { RecordingFooter } from "@/components/recording/footer";
import { RecordingZones, ZoneFocusOverlay } from "@/components/recording/zones";
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
import { useRecordingCapabilities } from "@/lib/hooks/useRecordingConfig";
import { useAllPermissionsGranted } from "@/lib/hooks/useStandalonePermissions";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import type {
  ActivityPayload,
  PublicActivityCategory,
  PublicActivityLocation,
  RecordingState,
} from "@repo/core";
import { useRouter } from "expo-router";
import {
  Activity,
  AlertTriangle,
  Bike,
  ChevronLeft,
  Dumbbell,
  Footprints,
  Waves,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

// Helper function to map service state to RecordingState
function mapServiceStateToRecordingState(serviceState: string): RecordingState {
  if (serviceState === "pending") return "not_started";
  if (serviceState === "recording") return "recording";
  if (serviceState === "paused") return "paused";
  return "not_started"; // fallback
}

function RecordScreen() {
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const insets = useSafeAreaInsets();

  // Use shared service from context (provided by _layout.tsx)
  const service = useSharedActivityRecorder();

  // State and actions
  const state = useRecordingState(service);
  const { count: sensorCount } = useSensors(service);
  const plan = usePlan(service);
  const { isOutdoorActivity, activityCategory, activityLocation } =
    useActivityStatus(service);
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

  // Initialize from store selection (or show inline selector)
  useEffect(() => {
    if (!service || isInitialized) return;

    const initializeFromStore = () => {
      try {
        console.log("[RecordModal] Loading selection from store");

        // Get selection from store (don't consume yet)
        const selection = activitySelectionStore.peekSelection();

        if (!selection) {
          // No pre-loaded activity - this is a direct tab access
          // Default to outdoor run
          console.log(
            "[RecordModal] No selection found - defaulting to outdoor run",
          );

          const defaultPayload: ActivityPayload = {
            category: "run",
            location: "outdoor",
          };

          service.selectActivityFromPayload(defaultPayload);
          setIsInitialized(true);
          return;
        }

        console.log("[RecordModal] Selection loaded:", {
          category: selection.category,
          location: selection.location,
          hasPlan: !!selection.plan,
          plannedActivityId: selection.plannedActivityId,
        });

        // Initialize the service based on the selection
        console.log("[RecordModal] Processing selection with service method");
        service.selectActivityFromPayload(selection);

        // Now consume the selection
        activitySelectionStore.consumeSelection();

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

  // Handle activity selection from modal (for quick start)
  const handleActivitySelect = useCallback(
    (category: PublicActivityCategory, location: PublicActivityLocation) => {
      if (!service) {
        Alert.alert("Error", "Service not initialized");
        return;
      }

      console.log("[RecordModal] Activity selected from modal:", {
        category,
        location,
      });

      // When changing location/category, DO NOT include the plan in the payload
      // This allows selectActivityFromPayload to call updateActivityConfiguration
      // which preserves the plan and only updates the location/category
      const payload: ActivityPayload = {
        category,
        location,
        // Note: We intentionally DO NOT include the plan here
        // The plan should remain untouched when just changing location/category
      };

      console.log("[RecordModal] Updating activity configuration:", {
        category,
        location,
        hasPlan: !!service.plan,
      });

      // This will call updateActivityConfiguration (if state !== 'pending')
      // which preserves the existing plan and only updates location/category
      service.selectActivityFromPayload(payload);
    },
    [service],
  );

  // Get activity icon based on category (memoized to prevent re-computation)
  const ActivityIcon = useMemo(() => {
    switch (activityCategory) {
      case "run":
        return Footprints;
      case "bike":
        return Bike;
      case "swim":
        return Waves;
      case "strength":
        return Dumbbell;
      case "other":
      default:
        return Activity;
    }
  }, [activityCategory]);

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
          const { requestPermission } =
            await import("@/lib/services/permissions-check");

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
              [{ text: "OK", style: "cancel" }],
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

    // Validate plan requirements before starting
    if (service) {
      const validation = service.validatePlanRequirements();

      if (validation && !validation.isValid) {
        // Plan has missing required metrics
        const metricDetails = validation.missingMetrics
          .map((m) => `• ${m.name}\n  ${m.description}`)
          .join("\n\n");

        Alert.alert(
          "Profile Setup Required",
          `This workout requires the following metrics:\n\n${metricDetails}\n\nWithout these, automatic trainer control (ERG mode) and accurate targets will not be available.\n\nSet these in Settings → Profile.`,
          [
            {
              text: "Go to Settings",
              onPress: () => {
                router.push("/settings");
              },
            },
            {
              text: "Continue Anyway",
              style: "destructive",
              onPress: async () => {
                console.log(
                  "[RecordModal] User chose to continue without required metrics",
                );
                try {
                  await start();
                  console.log("[RecordModal] Recording started successfully");
                } catch (error) {
                  console.error(
                    "[RecordModal] Error starting recording:",
                    error,
                  );
                  Alert.alert(
                    "Error",
                    "Failed to start recording. Please try again.",
                  );
                }
              },
            },
            {
              text: "Cancel",
              style: "cancel",
            },
          ],
        );
        return;
      }

      // Show warnings if any (non-blocking)
      if (validation && validation.warnings.length > 0) {
        console.log(
          "[RecordModal] Plan validation warnings:",
          validation.warnings,
        );
      }
    }

    // All permissions granted and plan validated, start recording
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

  // Handle lap action
  const handleLap = useCallback(() => {
    if (!service) return;

    const lapTime = service.recordLap();
    console.log("[RecordModal] Lap recorded:", lapTime);
  }, [service]);

  // Debug: Track activity status changes
  useEffect(() => {
    console.log("[RecordModal] Activity status changed:", {
      isOutdoorActivity,
      hasPlan: plan.hasPlan,
    });
  }, [isOutdoorActivity, plan.hasPlan]);

  // Get recording capabilities - determines what UI to show
  const capabilities = useRecordingCapabilities(service);

  // Determine if activity has a route (for zone rendering)
  // Check if the plan has a route_id or if a route is directly attached to the service
  const hasRoute = useMemo(() => {
    return !!service?.plan?.route_id || !!service?.currentRoute;
  }, [service?.plan?.route_id, service?.currentRoute]);

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-muted-foreground">Initializing activity...</Text>
      </View>
    );
  }

  // Check if we need to show the activity selection prompt
  const needsActivitySelection = !activityCategory;

  return (
    <View className="flex-1 bg-background">
      {/* Floating Close Button (only shows before recording starts) */}
      {state === "pending" && (
        <View
          className="absolute top-4 left-4 z-50"
          style={{ top: insets.top + 16 }}
        >
          <Button
            size="icon"
            variant="outline"
            onPress={() => {
              // Dismiss the record screen
              router.back();
            }}
            className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg"
          >
            <Icon as={ChevronLeft} size={20} />
          </Button>
        </View>
      )}

      {/* Activity Selection Modal */}
      <ActivitySelectionModal
        visible={activityModalVisible}
        onClose={() => setActivityModalVisible(false)}
        onActivitySelect={handleActivitySelect}
        currentCategory={activityCategory || "run"}
        currentLocation={activityLocation || "outdoor"}
      />

      {/* Sensor Disconnect Warning */}
      {(() => {
        const disconnectedSensors = service?.sensorsManager
          .getConnectedSensors()
          .filter((s) => s.connectionState === "disconnected");

        if (!disconnectedSensors || disconnectedSensors.length === 0)
          return null;

        return (
          <View
            className="bg-yellow-500/20 px-4 py-2 border-b border-yellow-500/40"
            style={{ marginTop: insets.top }}
          >
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

      {/* Zones Container - Takes remaining space above footer */}
      <View className="flex-1" style={{ paddingTop: insets.top }}>
        <RecordingZones
          service={service}
          category={activityCategory}
          location={activityLocation}
          hasPlan={plan.hasPlan}
          hasRoute={hasRoute}
        />

        {/* Focused Zone Overlay - Renders inside zones container */}
        <ZoneFocusOverlay
          service={service}
          category={activityCategory}
          location={activityLocation}
          hasPlan={plan.hasPlan}
          hasRoute={hasRoute}
        />
      </View>

      {/* Recording Footer - Bottom Sheet (positioned at bottom) */}
      <RecordingFooter
        service={service}
        recordingState={mapServiceStateToRecordingState(state)}
        category={activityCategory}
        location={activityLocation}
        hasPlan={plan.hasPlan}
        hasRoute={hasRoute}
        onStart={handleStart}
        onPause={pause}
        onResume={resume}
        onLap={handleLap}
        onFinish={handleFinish}
      />
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
