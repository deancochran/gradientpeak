import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { AlertTriangle, ChevronLeft, Upload } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActivityPlanRouteUpload } from "@/components/activity-plan/useActivityPlanRouteUpload";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { RecordingLiveCockpit } from "@/components/recording/cockpit";
import { RecordingActivityQuickEdit } from "@/components/recording/RecordingActivityQuickEdit";
import { ResourcePickerModal } from "@/components/shared/resource-picker";
import { usePerformanceScreenReady } from "@/lib/performance";
import { useRecordScreenController } from "@/lib/recording/useRecordScreenController";

function RecordScreen() {
  const insets = useSafeAreaInsets();
  const controller = useRecordScreenController();
  usePerformanceScreenReady("route-record", controller.isInitialized);
  const routeUpload = useActivityPlanRouteUpload({
    planName: "recording session",
    onRouteUploaded: (routeId) => {
      controller.service?.attachRoute(routeId).catch(() => null);
      controller.onCloseResourcePicker();
    },
  });

  if (!controller.isInitialized) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="record-screen-loading"
      >
        <Text className="text-muted-foreground">Initializing activity...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="record-screen-ready">
      {controller.serviceState !== "finishing" && controller.serviceState !== "finished" ? (
        <View className="absolute top-4 left-4 z-50" style={{ top: insets.top + 16 }}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={12}
            testID="record-close-button"
            onPress={controller.onBack}
            className="active:opacity-70"
          >
            <Icon as={ChevronLeft} size={20} />
          </Pressable>
        </View>
      ) : null}

      <RecordingActivityQuickEdit
        visible={controller.activityQuickEditVisible}
        onClose={controller.closeActivityQuickEdit}
        onActivitySelect={controller.handleActivityQuickEdit}
        currentCategory={controller.activityCategory || "run"}
        currentGpsRecordingEnabled={controller.gpsRecordingEnabled}
        canEditActivity={controller.sessionContract?.editing.canEditActivity ?? true}
        canEditGps={controller.sessionContract?.editing.canEditGps ?? true}
      />

      <ResourcePickerModal
        visible={!!controller.resourcePickerScope}
        scope={controller.resourcePickerScope ?? "routes"}
        selectedId={null}
        title={
          controller.resourcePickerScope === "activityPlans"
            ? "Attach Activity Plan"
            : "Attach Route"
        }
        description={
          controller.resourcePickerScope === "activityPlans"
            ? "Search activity plans visible to your profile."
            : "Search routes visible to your profile, or upload a new GPX route."
        }
        onClose={controller.onCloseResourcePicker}
        onSelect={controller.onSelectResource}
        footerAction={
          controller.resourcePickerScope === "routes" ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-11 flex-row items-center justify-center gap-2 rounded-md border border-border px-3 py-2"
              disabled={routeUpload.isUploadingRoute}
              onPress={routeUpload.pickGpxFile}
            >
              <Icon as={Upload} size={16} className="text-foreground" />
              <Text className="text-sm font-semibold text-foreground">
                {routeUpload.isUploadingRoute ? "Uploading route..." : "Upload New GPX Route"}
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      {controller.disconnectedSensors.length > 0 ? (
        <View
          className="bg-yellow-500/20 px-4 py-2 border-b border-yellow-500/40"
          style={{ marginTop: insets.top }}
        >
          <View className="flex-row items-center gap-2">
            <Icon as={AlertTriangle} size={16} className="text-yellow-600" />
            <Text className="text-xs text-yellow-600 font-medium">
              {controller.disconnectedSensors.length} sensor(s) disconnected
            </Text>
          </View>
          <Text className="text-xs text-yellow-600 mt-1">
            {controller.disconnectedSensors.map((sensor) => sensor.name).join(", ")} - attempting
            reconnection
          </Text>
        </View>
      ) : null}

      <RecordingLiveCockpit
        activityCategory={controller.activityCategory}
        gpsRecordingEnabled={controller.gpsRecordingEnabled}
        hasPlan={controller.hasPlan}
        sensorCount={controller.sensorCount}
        service={controller.service}
        serviceState={controller.serviceState}
        onGpsPress={controller.onGpsPress}
        onOpenActivity={controller.onOpenActivity}
        onOpenFtms={controller.onOpenFtms}
        onOpenPlan={controller.onOpenPlan}
        onOpenRoute={controller.onOpenRoute}
        onOpenSensors={controller.onOpenSensors}
        onRemovePlan={controller.onRemovePlan}
        onRemoveRoute={controller.onRemoveRoute}
        onStart={controller.handleStart}
        onPause={controller.onPause}
        onResume={controller.onResume}
        onLap={controller.handleLap}
        onFinish={controller.handleFinish}
        recordingState={controller.recordingState}
        sessionContract={controller.sessionContract}
      />

      {controller.isFinishing ? (
        <View
          className="absolute inset-0 items-center justify-center bg-background/80 px-8"
          testID="record-screen-finishing"
        >
          <Text className="text-lg font-semibold text-foreground">Finalizing activity...</Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            The submit screen will open after local files are saved.
          </Text>
        </View>
      ) : null}
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
