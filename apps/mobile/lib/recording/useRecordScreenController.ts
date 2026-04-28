import type { ActivityPayload, RecordingActivityCategory, RecordingState } from "@repo/core";
import { useRouter } from "expo-router";
import React from "react";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import {
  useActivityStatus,
  usePlan,
  useRecorderActions,
  useRecordingState,
  useSensors,
} from "@/lib/hooks/useActivityRecorder";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRecordingSessionContract } from "@/lib/hooks/useRecordingConfig";
import { useAllPermissionsGranted } from "@/lib/hooks/useStandalonePermissions";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  activitySelectionStore,
  defaultRecordLaunchPayload,
  type RecordingLaunchPayload,
} from "@/lib/stores/activitySelectionStore";

export function useRecordScreenController() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const { user } = useAuth();
  const service = useSharedActivityRecorder();
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [activityQuickEditVisible, setActivityQuickEditVisible] = React.useState(false);
  const [isFinishing, setIsFinishing] = React.useState(false);

  const state = useRecordingState(service);
  const { count: sensorCount, sensors } = useSensors(service);
  const plan = usePlan(service);
  const { gpsRecordingEnabled, activityCategory } = useActivityStatus(service);
  const { start, pause, resume, finish } = useRecorderActions(service);
  const { allGranted: allPermissionsGranted, isLoading: permissionsLoading } =
    useAllPermissionsGranted();
  const sessionContract = useRecordingSessionContract(service);

  const { data: zones } = api.profiles.getZones.useQuery(undefined, {
    enabled: !!user && !!service,
    staleTime: 1000 * 60 * 5,
  });

  React.useEffect(() => {
    if (!service || !zones?.profile) return;

    const { ftp, threshold_hr, weight_kg, threshold_pace } = zones.profile;

    if (ftp || threshold_hr || weight_kg || threshold_pace) {
      console.log("[RecordModal] Applying derived metrics:", {
        ftp,
        threshold_hr,
        weight_kg,
        threshold_pace,
      });
      service.updateMetrics({
        ftp: ftp || undefined,
        thresholdHr: threshold_hr || undefined,
        weightKg: weight_kg || undefined,
        thresholdPaceSecondsPerKm: threshold_pace || undefined,
      });
    }
  }, [service, zones?.profile]);

  React.useEffect(() => {
    console.log("[RecordModal] Permission status changed:", {
      allPermissionsGranted,
      permissionsLoading,
    });
  }, [allPermissionsGranted, permissionsLoading]);

  React.useEffect(() => {
    if (!service || isInitialized) return;

    const initializeFromStore = async () => {
      try {
        console.log("[RecordModal] Loading selection from store");

        const selection = activitySelectionStore.peekSelection();

        if (!selection) {
          console.log("[RecordModal] No selection found - using default launch payload");
          service.selectActivityFromPayload(defaultRecordLaunchPayload());
          setIsInitialized(true);
          return;
        }

        console.log("[RecordModal] Selection loaded:", {
          launchSource: selection.launchSource,
          category: selection.category,
          gpsRecordingEnabled: selection.gpsRecordingEnabled,
          hasPlan: !!selection.plan,
          eventId: selection.eventId,
          routeId: selection.routeId ?? selection.plan?.route_id ?? null,
        });

        console.log("[RecordModal] Processing selection with service method");
        service.selectActivityFromPayload(selection);
        activitySelectionStore.consumeSelection();

        prepareStandaloneRouteIfNeeded(service, selection);

        setIsInitialized(true);
      } catch (error) {
        console.error("[RecordModal] Error initializing from store:", error);
        Alert.alert("Error", "Failed to initialize activity. Please try again.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    };

    initializeFromStore().catch((error) => {
      console.error("[RecordModal] Error initializing from store:", error);
    });
  }, [service, isInitialized, router]);

  const handleActivityQuickEdit = React.useCallback(
    (category: RecordingActivityCategory, nextGpsRecordingEnabled: boolean) => {
      if (!service) {
        Alert.alert("Error", "Service not initialized");
        return;
      }

      const canEditActivity = sessionContract?.editing.canEditActivity ?? true;
      const canEditGps = sessionContract?.editing.canEditGps ?? true;
      const categoryChanged = category !== activityCategory;
      const gpsChanged = nextGpsRecordingEnabled !== gpsRecordingEnabled;

      if (categoryChanged && !canEditActivity) {
        Alert.alert("Activity Locked", "The attached plan owns this session's activity category.");
        return;
      }

      if (gpsChanged && !canEditGps) {
        Alert.alert("GPS Locked", "GPS recording cannot be changed for this session.");
        return;
      }

      console.log("[RecordModal] Activity quick edit selected:", {
        category,
        gpsRecordingEnabled: nextGpsRecordingEnabled,
      });

      const payload: ActivityPayload = {
        category: canEditActivity ? category : activityCategory,
        gpsRecordingEnabled: nextGpsRecordingEnabled,
      };

      console.log("[RecordModal] Updating activity configuration:", {
        category,
        gpsRecordingEnabled: nextGpsRecordingEnabled,
        hasPlan: !!service.plan,
      });

      service.selectActivityFromPayload(payload);
    },
    [
      activityCategory,
      gpsRecordingEnabled,
      service,
      sessionContract?.editing.canEditActivity,
      sessionContract?.editing.canEditGps,
    ],
  );

  const handleStart = React.useCallback(async () => {
    console.log("[RecordModal] Start clicked, checking permissions");
    console.log("[RecordModal] allPermissionsGranted:", allPermissionsGranted);

    if (!allPermissionsGranted) {
      console.log("[RecordModal] Permissions not granted, requesting permissions");

      if (!service) {
        Alert.alert("Error", "Service not initialized");
        return;
      }

      try {
        const granted = await service.refreshAndCheckAllPermissions();

        if (!granted) {
          const { requestPermission } = await import("@/lib/services/permissions-check");

          await requestPermission("bluetooth");
          await requestPermission("location");
          await requestPermission("location-background");

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
        Alert.alert("Error", "Failed to request permissions. Please try again.");
        return;
      }
    }

    if (service) {
      const validation = service.validatePlanRequirements();

      if (validation && !validation.isValid) {
        const metricDetails = validation.missingMetrics
          .map((m) => `- ${m.name}\n  ${m.description}`)
          .join("\n\n");

        Alert.alert(
          "Profile Setup Required",
          `This workout requires the following metrics:\n\n${metricDetails}\n\nWithout these, automatic trainer control (ERG mode) and accurate targets will not be available.\n\nSet these in Settings > Profile.`,
          [
            {
              text: "Go to Profile",
              onPress: () => {
                if (!user?.id) return;
                navigateTo({
                  pathname: "/user/[userId]",
                  params: { userId: user.id },
                } as any);
              },
            },
            {
              text: "Continue Anyway",
              style: "destructive",
              onPress: async () => {
                console.log("[RecordModal] User chose to continue without required metrics");
                try {
                  await start();
                  console.log("[RecordModal] Recording started successfully");
                } catch (error) {
                  console.error("[RecordModal] Error starting recording:", error);
                  Alert.alert("Error", "Failed to start recording. Please try again.");
                }
              },
            },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      }

      if (validation && validation.warnings.length > 0) {
        console.log("[RecordModal] Plan validation warnings:", validation.warnings);
      }
    }

    console.log("[RecordModal] Permissions granted, starting recording");
    try {
      await start();
      console.log("[RecordModal] Recording started successfully");
    } catch (error) {
      console.error("[RecordModal] Error starting recording:", error);
      Alert.alert("Error", "Failed to start recording. Please try again.");
    }
  }, [allPermissionsGranted, navigateTo, start, service, user?.id]);

  const handleFinish = React.useCallback(async () => {
    if (isFinishing) return;

    console.log("[RecordModal] Finish clicked, finalizing local artifacts");

    try {
      setIsFinishing(true);
      await finish();
      navigateTo("/record/submit");
    } catch (error) {
      console.error("[RecordModal] Error finishing recording:", error);
      Alert.alert(
        "Finish Failed",
        error instanceof Error ? error.message : "Failed to finalize activity. Please try again.",
      );
    } finally {
      setIsFinishing(false);
    }
  }, [finish, isFinishing, navigateTo]);

  const handleLap = React.useCallback(() => {
    if (!service) return;

    const lapTime = service.recordLap();
    console.log("[RecordModal] Lap recorded:", lapTime);
  }, [service]);

  const closeActivityQuickEdit = React.useCallback(() => {
    setActivityQuickEditVisible(false);
  }, []);

  const onBack = React.useCallback(() => {
    router.back();
  }, [router]);

  const onGpsPress = React.useCallback(() => {
    if (!service) return;

    if (sessionContract && !sessionContract.editing.canEditGps) {
      Alert.alert("GPS Locked", "GPS recording cannot be changed for this session.");
      return;
    }

    service.selectActivityFromPayload({
      category: activityCategory,
      gpsRecordingEnabled: !gpsRecordingEnabled,
    });
  }, [activityCategory, gpsRecordingEnabled, service, sessionContract]);

  const onOpenActivity = React.useCallback(() => {
    navigateTo("/record/activity");
  }, [navigateTo]);

  const onOpenFtms = React.useCallback(() => {
    navigateTo("/record/ftms");
  }, [navigateTo]);

  const onOpenPlan = React.useCallback(() => {
    navigateTo("/record/plan");
  }, [navigateTo]);

  const onOpenRoute = React.useCallback(() => {
    navigateTo("/record/route");
  }, [navigateTo]);

  const onOpenSensors = React.useCallback(() => {
    navigateTo("/record/sensors");
  }, [navigateTo]);

  const onRemovePlan = React.useCallback(() => {
    service?.clearPlan();
  }, [service]);

  const onRemoveRoute = React.useCallback(() => {
    service?.detachRoute();
  }, [service]);

  const disconnectedSensors = React.useMemo(
    () => sensors.filter((sensor) => sensor.connectionState === "disconnected"),
    [sensors],
  );

  const recordingState = React.useMemo(() => mapServiceStateToRecordingState(state), [state]);

  React.useEffect(() => {
    console.log("[RecordModal] Activity status changed:", {
      gpsRecordingEnabled,
      hasPlan: plan.hasPlan,
    });
  }, [gpsRecordingEnabled, plan.hasPlan]);

  return React.useMemo(
    () => ({
      activityCategory,
      activityQuickEditVisible,
      closeActivityQuickEdit,
      disconnectedSensors,
      gpsRecordingEnabled,
      handleActivityQuickEdit,
      handleFinish,
      handleLap,
      handleStart,
      hasPlan: plan.hasPlan,
      isFinishing,
      isInitialized,
      onBack,
      onGpsPress,
      onOpenActivity,
      onOpenFtms,
      onOpenPlan,
      onOpenRoute,
      onOpenSensors,
      onRemovePlan,
      onRemoveRoute,
      onPause: pause,
      onResume: resume,
      recordingState,
      sensorCount,
      service,
      serviceState: state,
      sessionContract,
    }),
    [
      activityCategory,
      activityQuickEditVisible,
      closeActivityQuickEdit,
      disconnectedSensors,
      gpsRecordingEnabled,
      handleActivityQuickEdit,
      handleFinish,
      handleLap,
      handleStart,
      isFinishing,
      isInitialized,
      onBack,
      onGpsPress,
      onOpenActivity,
      onOpenFtms,
      onOpenPlan,
      onOpenRoute,
      onOpenSensors,
      onRemovePlan,
      onRemoveRoute,
      pause,
      plan.hasPlan,
      recordingState,
      resume,
      sensorCount,
      service,
      state,
      sessionContract,
    ],
  );
}

function mapServiceStateToRecordingState(serviceState: string): RecordingState {
  if (serviceState === "pending") return "not_started";
  if (serviceState === "recording") return "recording";
  if (serviceState === "paused" || serviceState === "finishing") return "paused";
  return "not_started";
}

function prepareStandaloneRouteIfNeeded(
  service: ActivityRecorderService,
  selection: RecordingLaunchPayload,
) {
  const explicitRouteId = selection.routeId ?? null;
  const planRouteId = selection.plan?.route_id ?? null;

  if (!explicitRouteId || explicitRouteId === planRouteId) return;

  console.log("[RecordModal] Preparing standalone route from launch payload:", explicitRouteId);
  service.prepareRouteAttachment(explicitRouteId);
}
