import { ActivitySelectionModal } from "@/components/ActivitySelectionModal";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { RecordingFooter } from "@/components/recording/footer";
import { RecordingZones, ZoneFocusOverlay } from "@/components/recording/zones";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { RecordingState } from "@repo/core";
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
} from "@repo/core";
import { useRouter } from "expo-router";
import {
  Activity,
  AlertTriangle,
  Bike,
  Bluetooth,
  ChevronRight,
  Dumbbell,
  Footprints,
  MapPin,
  Pause,
  Play,
  Square,
  Waves,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
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
function mapServiceStateToRecordingState(
  serviceState: string,
): RecordingState {
  if (serviceState === "pending") return "not_started";
  if (serviceState === "recording") return "recording";
  if (serviceState === "paused") return "paused";
  return "not_started"; // fallback
}

function RecordScreen() {
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  const [trainerNotificationDismissed, setTrainerNotificationDismissed] =
    useState(false);
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

      const payload: ActivityPayload = {
        category,
        location,
      };

      // Initialize the service with quick start
      // Note: Modal handles closing itself, no need to set state here
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

  // Handle discard action - cancel recording and go back
  const handleDiscard = useCallback(() => {
    console.log("[RecordModal] Discard clicked, cancelling recording");

    Alert.alert(
      "Discard Recording?",
      "Are you sure you want to discard this recording? This cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            // TODO: Add service.discard() method when available
            console.log("[RecordModal] Recording discarded");
            router.back();
          },
        },
      ],
    );
  }, [router]);

  // Handle lap action
  const handleLap = useCallback(() => {
    console.log("[RecordModal] Lap clicked");
    // TODO: Add service.recordLap() method when available
  }, []);

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
  const hasRoute = useMemo(() => {
    // TODO: Check if plan has a route_id or if route is attached
    // For now, return false - will be implemented when route attachment is added
    return false;
  }, []);

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
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
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
            <Icon as={X} size={20} />
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

      {/* Trainer Control Notification (Dismissible) */}
      {(() => {
        const trainer = service?.sensorsManager.getControllableTrainer();
        const currentStep = service?.currentStep;

        if (!trainer || !trainer.isControllable || trainerNotificationDismissed)
          return null;

        let targetDisplay = "Connected";
        const powerTargetIndex = currentStep?.targets?.findIndex(
          (target) => target.type === "%FTP",
        );
        if (powerTargetIndex && Array.isArray(currentStep?.targets)) {
          const powerTarget = resolvePowerTarget(
            currentStep?.targets?.[powerTargetIndex]?.intensity,
            service?.recordingMetadata?.profile,
          );
          if (powerTarget) {
            targetDisplay = `Target: ${powerTarget}W`;
          }
        } else if (
          currentStep?.targets &&
          typeof currentStep.targets === "object" &&
          "grade" in currentStep.targets &&
          currentStep.targets.grade !== undefined
        ) {
          targetDisplay = `Target: ${(currentStep.targets as { grade: number }).grade}%`;
        }

        return (
          <View className="bg-primary/10 px-4 py-2 border-b border-primary/20">
            <View className="flex-row items-center gap-2">
              <Icon as={Zap} size={16} className="text-primary" />
              <Text className="text-xs text-primary font-medium">
                Trainer Control Active
              </Text>
              <Text className="text-xs text-primary ml-auto mr-2">
                {targetDisplay}
              </Text>
              <Pressable
                onPress={() => setTrainerNotificationDismissed(true)}
                className="p-1 -mr-1"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon as={X} size={14} className="text-primary/60" />
              </Pressable>
            </View>
          </View>
        );
      })()}

      {/* Recording Zones - Vertical 3-zone stack */}
      <ScrollView className="flex-1" bounces={false}>
        <RecordingZones
          service={service}
          category={activityCategory}
          location={activityLocation}
          hasPlan={plan.hasPlan}
          hasRoute={hasRoute}
        />
      </ScrollView>

      {/* Focused Zone Overlay - Renders outside ScrollView */}
      <ZoneFocusOverlay
        service={service}
        category={activityCategory}
        location={activityLocation}
        hasPlan={plan.hasPlan}
        hasRoute={hasRoute}
      />

      {/* Recording Footer - Bottom Sheet */}
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
        onDiscard={handleDiscard}
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
