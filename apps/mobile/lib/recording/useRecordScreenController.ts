import {
  type ActivityPayload,
  activityPlanStructureSchema,
  createUnavailableAthletePerformanceTargetFacts,
  type RecordingActivityCategory,
  type RecordingServiceActivityPlan,
  type RecordingState,
} from "@repo/core";
import { useRouter } from "expo-router";
import React from "react";
import { Alert } from "react-native";
import type { ResourcePickerItem, ResourcePickerScope } from "@/components/shared/resource-picker";
import { api } from "@/lib/api";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { useRecordingCommands } from "@/lib/hooks/useActivityRecorder";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRecordingConfig } from "@/lib/hooks/useRecordingConfig";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useActivityRecorderService } from "@/lib/providers/ActivityRecorderProvider";
import type { ActivityRecorderService, RecordingLifecycle } from "@/lib/services/ActivityRecorder";
import {
  activitySelectionStore,
  defaultRecordLaunchPayload,
  type RecordingLaunchPayload,
} from "@/lib/stores/activitySelectionStore";

export function useRecordScreenController() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const { user } = useAuth();
  const { service } = useActivityRecorderService();
  const apiUtils = api.useUtils();
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [activityQuickEditVisible, setActivityQuickEditVisible] = React.useState(false);
  const [isFinishing, setIsFinishing] = React.useState(false);
  const [resourcePickerScope, setResourcePickerScope] = React.useState<ResourcePickerScope | null>(
    null,
  );
  const [pendingPlanId, setPendingPlanId] = React.useState<string | null>(null);
  const performanceModelAsOf = React.useRef(new Date().toISOString()).current;

  const { sessionContract, sessionView } = useRecordingConfig(service);
  const state = service?.state ?? "pending";
  const recordingLifecycle = (service?.recordingLifecycle ??
    sessionView?.lifecycle ??
    "idle") as RecordingLifecycle;
  const sensors = service?.sensorsManager?.getConnectedSensors() ?? [];
  const sensorCount = sensors.length;
  const plan = sessionView?.plan;
  const activityCategory = sessionView?.recordingConfiguration.input.activityCategory ?? "bike";
  const { start, pause, resume, finish } = useRecordingCommands(service);

  const { data: publishedAthleteState } = api.athleteIntelligence.getReadModel.useQuery(
    {
      profileId: user?.id ?? "",
      sections: {
        publishedState: true,
        status: true,
        currentBaseline: { includePlanningContext: true },
      },
    },
    {
      enabled: !!user && !!service && hasSessionAuthCredentials(),
    },
  );
  const performanceTargets = React.useMemo(() => {
    if (publishedAthleteState?.publishedState?.performanceTargets) {
      return publishedAthleteState.publishedState.performanceTargets;
    }
    return createUnavailableAthletePerformanceTargetFacts(
      publishedAthleteState?.publishedState?.publishedAt ?? performanceModelAsOf,
    );
  }, [performanceModelAsOf, publishedAthleteState]);

  const pendingPlanQuery = api.activityPlans.getById.useQuery(
    { id: pendingPlanId ?? "" },
    { enabled: !!pendingPlanId && !!service },
  );

  React.useEffect(() => {
    if (!pendingPlanId || !pendingPlanQuery.data?.detail || !service) {
      return;
    }

    try {
      const planDetail = pendingPlanQuery.data.detail;
      const structure = activityPlanStructureSchema.safeParse(planDetail.structure);
      if (!planDetail.capabilities.canRecord || !structure.success) {
        throw new Error(
          "Duplicate this plan into your library before attaching it to a recording.",
        );
      }
      const pendingPlan: RecordingServiceActivityPlan = {
        id: planDetail.id,
        name: planDetail.name,
        structure: structure.data,
      };
      service.selectPlan(pendingPlan);
      setPendingPlanId(null);
      setResourcePickerScope(null);
    } catch (error) {
      Alert.alert(
        "Plan Attachment Failed",
        error instanceof Error ? error.message : "Unable to attach this activity plan.",
      );
      setPendingPlanId(null);
    }
  }, [pendingPlanId, pendingPlanQuery.data, service]);

  React.useEffect(() => {
    if (!pendingPlanId || !pendingPlanQuery.error) {
      return;
    }

    Alert.alert("Plan Attachment Failed", "Unable to load this activity plan.");
    setPendingPlanId(null);
  }, [pendingPlanId, pendingPlanQuery.error]);

  React.useEffect(() => {
    if (!service || !performanceTargets) return;
    service.updatePerformanceTargets(performanceTargets);
  }, [performanceTargets, service]);

  React.useEffect(() => {
    if (!service || !publishedAthleteState?.currentBaseline?.planningContext) return;

    const weight_kg = publishedAthleteState.currentBaseline.planningContext.body.weightKg.value;

    if (weight_kg) {
      console.log("[RecordModal] Applying derived metrics:", {
        weight_kg,
      });
      service.updateMetrics({
        weightKg: weight_kg,
      });
    }
  }, [publishedAthleteState?.currentBaseline, service]);

  React.useEffect(() => {
    if (!service || isInitialized) return;

    const initializeFromStore = async () => {
      try {
        console.log("[RecordModal] Loading selection from store");

        const selection = activitySelectionStore.peekSelection();

        if (recordingLifecycle === "active") {
          console.log(
            "[RecordModal] Active recording found - skipping launch payload initialization",
          );
          if (selection) {
            activitySelectionStore.consumeSelection();
          }
          setIsInitialized(true);
          return;
        }

        if (!selection) {
          if (recordingLifecycle === "setup") {
            console.log("[RecordModal] Existing setup found - skipping default launch payload");
            setIsInitialized(true);
            return;
          }

          console.log("[RecordModal] No selection found - using default launch payload");
          service.selectActivityFromPayload(defaultRecordLaunchPayload());
          setIsInitialized(true);
          return;
        }

        console.log("[RecordModal] Selection loaded:", {
          launchSource: selection.launchSource,
          activity_category: selection.activity_category,
          gpsRecordingEnabled: selection.gpsRecordingEnabled,
          hasPlan: !!selection.plan,
          eventId: selection.eventId,
          routeId: selection.routeId ?? null,
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
  }, [service, isInitialized, router, recordingLifecycle]);

  const handleActivityQuickEdit = React.useCallback(
    (activity_category: RecordingActivityCategory, _nextGpsRecordingEnabled: boolean) => {
      if (!service) {
        Alert.alert("Error", "Service not initialized");
        return;
      }

      const canEditActivity = sessionContract?.editing.canEditActivity ?? true;
      const categoryChanged = activity_category !== activityCategory;

      if (categoryChanged && !canEditActivity) {
        Alert.alert(
          "Activity Locked",
          "The attached plan owns this session's activity activity_category.",
        );
        return;
      }

      console.log("[RecordModal] Activity quick edit selected:", {
        activity_category,
        gpsRecordingEnabled: false,
      });

      const payload: ActivityPayload = {
        activity_category: canEditActivity ? activity_category : activityCategory,
        gpsRecordingEnabled: false,
      };

      console.log("[RecordModal] Updating activity configuration:", {
        activity_category,
        gpsRecordingEnabled: false,
        hasPlan: !!service.plan,
      });

      service.selectActivityFromPayload(payload);
    },
    [activityCategory, service, sessionContract?.editing.canEditActivity],
  );

  const fetchStartPerformanceTargets = React.useCallback(async () => {
    const asOf = new Date().toISOString();
    if (!user?.id) return createUnavailableAthletePerformanceTargetFacts(asOf);
    try {
      const published = await apiUtils.athleteIntelligence.getReadModel.fetch({
        profileId: user.id,
        sections: { publishedState: true, status: true },
      });
      if (!published.publishedState?.performanceTargets) {
        console.warn(
          `[RecordModal] Start-time performance targets ${published.status?.freshness ?? "unavailable"}`,
        );
        return createUnavailableAthletePerformanceTargetFacts(
          published.publishedState?.publishedAt ?? asOf,
        );
      }
      return published.publishedState.performanceTargets;
    } catch {
      console.warn("[RecordModal] Start-time performance targets unavailable");
      return createUnavailableAthletePerformanceTargetFacts(asOf);
    }
  }, [apiUtils, user?.id]);

  const handleStart = React.useCallback(async () => {
    console.log("[RecordModal] Start clicked, checking permissions");

    if (!service) {
      Alert.alert("Error", "Service not initialized");
      return;
    }

    const hasRequiredPermissions = await service.refreshAndCheckRecordingPermissions(false);

    if (!hasRequiredPermissions) {
      console.log("[RecordModal] Permissions not granted, requesting permissions");

      try {
        const granted = await service.refreshAndCheckRecordingPermissions(false);

        if (!granted) {
          const { requestPermission } = await import("@/lib/services/permissions-check");

          await requestPermission("bluetooth");

          const finalCheck = await service.refreshAndCheckRecordingPermissions(false);

          if (!finalCheck) {
            Alert.alert(
              "Permissions Required",
              "This app requires Bluetooth permission to record connected sensors. Please enable it in your device settings.",
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

    const startPerformanceTargets = await fetchStartPerformanceTargets();
    service.updatePerformanceTargets(startPerformanceTargets);

    const validation = service.validatePlanRequirements(startPerformanceTargets);

    if (validation && !validation.isValid) {
      const metricDetails = validation.missingMetrics
        .map((m) => `- ${m.name}\n  ${m.description}`)
        .join("\n\n");

      Alert.alert(
        "Profile Setup Required",
        `This activity requires the following metrics:\n\n${metricDetails}\n\nWithout these, automatic trainer control (ERG mode) and accurate targets will not be available.\n\nSet these in Settings > Profile.`,
        [
          {
            text: "Go to Profile",
            onPress: () => {
              navigateTo("/profile");
            },
          },
          {
            text: "Continue Anyway",
            style: "destructive",
            onPress: async () => {
              console.log("[RecordModal] User chose to continue without required metrics");
              try {
                await start(startPerformanceTargets);
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

    console.log("[RecordModal] Permissions granted, starting recording");
    try {
      await start(startPerformanceTargets);
      console.log("[RecordModal] Recording started successfully");
    } catch (error) {
      console.error("[RecordModal] Error starting recording:", error);
      Alert.alert("Error", "Failed to start recording. Please try again.");
    }
  }, [fetchStartPerformanceTargets, navigateTo, start, service]);

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
    Alert.alert("GPS Unavailable", "New live recordings no longer capture location.");
  }, []);

  const onOpenActivity = React.useCallback(() => {
    navigateTo("/record/activity");
  }, [navigateTo]);

  const onOpenPlan = React.useCallback(() => {
    setResourcePickerScope("activityPlans");
  }, []);

  const onOpenRoute = React.useCallback(() => {
    setResourcePickerScope("routes");
  }, []);

  const onCloseResourcePicker = React.useCallback(() => {
    setResourcePickerScope(null);
  }, []);

  const onSelectResource = React.useCallback(
    (item: ResourcePickerItem) => {
      if (!service || !resourcePickerScope) {
        return;
      }

      if (resourcePickerScope === "routes") {
        service.attachRoute(item.id).catch((error) => {
          Alert.alert(
            "Route Attachment Failed",
            error instanceof Error ? error.message : "Unable to attach this route.",
          );
        });
        setResourcePickerScope(null);
        return;
      }

      setPendingPlanId(item.id);
    },
    [resourcePickerScope, service],
  );

  const onOpenSensors = React.useCallback(() => {
    navigateTo("/record/sensors");
  }, [navigateTo]);

  const onOpenFtms = onOpenSensors;

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
      gpsRecordingEnabled: false,
      hasPlan: plan?.hasPlan ?? false,
    });
  }, [plan?.hasPlan]);

  return React.useMemo(
    () => ({
      activityCategory,
      activityQuickEditVisible,
      closeActivityQuickEdit,
      disconnectedSensors,
      gpsRecordingEnabled: false,
      handleActivityQuickEdit,
      handleFinish,
      handleLap,
      handleStart,
      hasPlan: plan?.hasPlan ?? false,
      isFinishing,
      isInitialized,
      onBack,
      onGpsPress,
      onOpenActivity,
      onOpenFtms,
      onOpenPlan,
      onOpenRoute,
      onOpenSensors,
      onCloseResourcePicker,
      onRemovePlan,
      onRemoveRoute,
      onSelectResource,
      onPause: pause,
      onResume: resume,
      recordingState,
      resourcePickerScope,
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
      onCloseResourcePicker,
      onRemovePlan,
      onRemoveRoute,
      onSelectResource,
      pause,
      plan?.hasPlan,
      recordingState,
      resourcePickerScope,
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

  if (!explicitRouteId) return;

  console.log("[RecordModal] Preparing standalone route from launch payload:", explicitRouteId);
  service.prepareRouteAttachment(explicitRouteId);
}
