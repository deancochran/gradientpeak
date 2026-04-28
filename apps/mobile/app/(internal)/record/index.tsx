import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { AlertTriangle, ChevronLeft } from "lucide-react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { RecordingLiveCockpit } from "@/components/recording/cockpit";
import { RecordingActivityQuickEdit } from "@/components/recording/RecordingActivityQuickEdit";
import { useRecordScreenController } from "@/lib/recording/useRecordScreenController";

function RecordScreen() {
  const insets = useSafeAreaInsets();
  const controller = useRecordScreenController();

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
      {controller.serviceState === "pending" && (
        <View className="absolute top-4 left-4 z-50" style={{ top: insets.top + 16 }}>
          <Button
            size="icon"
            variant="outline"
            testID="record-close-button"
            onPress={controller.onBack}
            className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg"
          >
            <Icon as={ChevronLeft} size={20} />
          </Button>
        </View>
      )}

      <RecordingActivityQuickEdit
        visible={controller.activityQuickEditVisible}
        onClose={controller.closeActivityQuickEdit}
        onActivitySelect={controller.handleActivityQuickEdit}
        currentCategory={controller.activityCategory || "run"}
        currentGpsRecordingEnabled={controller.gpsRecordingEnabled}
        canEditActivity={controller.sessionContract?.editing.canEditActivity ?? true}
        canEditGps={controller.sessionContract?.editing.canEditGps ?? true}
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
