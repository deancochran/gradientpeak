/**
 * Footer Expanded State
 *
 * Displays recording controls with a compact setup/adjustment surface.
 * Height: 60% of screen
 *
 * Before start it keeps setup actions available.
 * After start it switches to a locked session summary plus one adjustment surface.
 */

import type { MetricFamily, RecordingActivityCategory, RecordingState } from "@repo/core";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import {
  ArrowUpRight,
  Bluetooth,
  Gauge,
  MapPin,
  MapPinOff,
  Route,
  Settings2,
  WifiOff,
} from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useBleState,
  useCurrentReadings,
  useGpsTracking,
  useSensors,
  useSessionView,
} from "@/lib/hooks/useActivityRecorder";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { IntensityScaling } from "./IntensityScaling";
import { RecordingControls } from "./RecordingControls";

export interface FooterExpandedContentProps {
  service: ActivityRecorderService | null;
  recordingState: RecordingState;
  category: RecordingActivityCategory;
  gpsRecordingEnabled: boolean;
  hasPlan: boolean;
  hasRoute: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onLap: () => void;
  onFinish: () => void;
}

export function FooterExpandedContent({
  service,
  recordingState,
  category,
  gpsRecordingEnabled,
  hasPlan,
  hasRoute,
  onStart,
  onPause,
  onResume,
  onLap,
  onFinish,
}: FooterExpandedContentProps) {
  const navigateTo = useAppNavigate();
  const insets = useSafeAreaInsets();
  const { toggleGps } = useGpsTracking(service);
  const { sensors } = useSensors(service);
  const sessionView = useSessionView(service);
  const currentReadings = useCurrentReadings(service);
  const bleState = useBleState(service);
  const isRecordingStarted = recordingState !== "not_started";
  const snapshot = sessionView?.snapshot;
  const runtimeSourceState = sessionView?.runtimeSourceState;
  const preferredSources = sessionView?.overrideState.preferredSources ?? {};
  const trainerMode = sessionView?.overrideState.trainerMode ?? "auto";
  const trainerView = sessionView?.trainer;
  const trainerSensor = React.useMemo(
    () => sensors.find((sensor) => sensor.isControllable || Boolean(sensor.ftmsFeatures)) ?? null,
    [sensors],
  );
  const trainerAvailable = Boolean(trainerSensor || trainerView?.machineType);
  const trainerControlReady = Boolean(trainerSensor?.isControllable);
  const trainerMachineLabel = trainerView?.machineType
    ? trainerView.machineType.replace(/_/g, " ")
    : null;
  const trainerDataFlowing = React.useMemo(
    () => hasRecentTrainerData(currentReadings.lastUpdated),
    [currentReadings.lastUpdated],
  );
  const trainerSummary = React.useMemo(
    () =>
      getTrainerSummary({
        bleState,
        trainerAvailable,
        trainerControlReady,
        trainerDataFlowing,
        recoveryState: trainerView?.recoveryState ?? "idle",
        commandFailed: trainerView?.lastCommandStatus?.success === false,
      }),
    [
      bleState,
      trainerAvailable,
      trainerControlReady,
      trainerDataFlowing,
      trainerView?.lastCommandStatus?.success,
      trainerView?.recoveryState,
    ],
  );
  const sourceMetrics = React.useMemo(() => {
    if (!service || !runtimeSourceState) {
      return [];
    }

    const metrics = new Set<MetricFamily>(runtimeSourceState.degradedState.metrics);

    for (const metricFamily of Object.keys(preferredSources) as MetricFamily[]) {
      metrics.add(metricFamily);
    }

    return Array.from(metrics)
      .map((metricFamily) => {
        const selection = runtimeSourceState.selectedSources.find(
          (candidate) => candidate.metricFamily === metricFamily,
        );
        const candidates = service
          .getAvailableMetricSources(metricFamily)
          .filter(
            (candidate, index, allCandidates) =>
              allCandidates.findIndex((entry) => entry.sourceId === candidate.sourceId) === index,
          );

        return {
          metricFamily,
          selection,
          candidates,
        };
      })
      .filter(({ selection, candidates }) => selection || candidates.length > 1);
  }, [preferredSources, runtimeSourceState, service]);

  const handleActivityPress = () => {
    if (!isRecordingStarted) {
      console.log("[FooterExpanded] Navigating to activity selection");
      navigateTo("/record/activity");
    }
  };

  const handleGpsToggle = async () => {
    console.log("[FooterExpanded] Toggling GPS/Location mode");
    await toggleGps();
  };

  const handlePlanPress = () => {
    console.log("[FooterExpanded] Navigating to plan picker");
    navigateTo("/record/plan");
  };

  const handleRoutePress = () => {
    console.log("[FooterExpanded] Navigating to route picker");
    navigateTo("/record/route");
  };

  const handleSensorsPress = () => {
    console.log("[FooterExpanded] Navigating to sensors");
    navigateTo("/record/sensors");
  };

  const handleAdjustPress = () => {
    console.log("[FooterExpanded] Navigating to FTMS control");
    navigateTo("/record/ftms");
  };

  const handleTrainerPrimaryAction = () => {
    if (trainerSummary.action === "controls") {
      handleAdjustPress();
      return;
    }

    handleSensorsPress();
  };

  const handleTrainerModeChange = (mode: "auto" | "manual") => {
    if (!service) return;

    service.setManualControlMode(mode === "manual");
  };

  const handlePreferredSourcePress = (metricFamily: MetricFamily, sourceId: string) => {
    if (!service) return;

    if (preferredSources[metricFamily] === sourceId) {
      service.clearPreferredMetricSource(metricFamily);
      return;
    }

    service.setPreferredMetricSource(metricFamily, sourceId);
  };

  const activeCategory = snapshot?.activity.category ?? category;
  const activeGpsEnabled =
    snapshot?.activity.gpsMode === "on" || (!snapshot && gpsRecordingEnabled);
  const activeHasPlan = Boolean(snapshot?.activity.activityPlanId ?? hasPlan);
  const activeHasRoute = Boolean(snapshot?.activity.routeId ?? hasRoute);
  const modeLabel = snapshot?.activity.mode === "planned" || activeHasPlan ? "Planned" : "Free";

  return (
    <ScrollView className="flex-1 bg-background" bounces={false}>
      <View className="px-4 pt-4" style={{ paddingBottom: Math.max(24, insets.bottom + 12) }}>
        {/* Recording Controls (Pinned) */}
        <View className="mb-6">
          <RecordingControls
            recordingState={recordingState}
            onStart={onStart}
            onPause={onPause}
            onResume={onResume}
            onLap={onLap}
            onFinish={onFinish}
            onDiscard={() => {}}
          />
        </View>

        <SectionCard
          title={isRecordingStarted ? "Session Locked In" : "Workout Setup"}
          description={
            isRecordingStarted
              ? "Major workout identity changes are locked for this session."
              : "Finish setup here before you start recording."
          }
        >
          <SummaryRow
            label="Activity"
            value={activeCategory.replace(/_/g, " ")}
            icon={<Gauge size={16} color="#71717a" />}
            onPress={!isRecordingStarted ? handleActivityPress : undefined}
            testID="record-activity-summary-button"
          />
          <SummaryRow
            label="Mode"
            value={modeLabel}
            icon={<Settings2 size={16} color="#71717a" />}
          />
          <SummaryRow
            label="GPS"
            value={activeGpsEnabled ? "On" : "Off"}
            icon={
              activeGpsEnabled ? (
                <MapPin size={16} color="#71717a" />
              ) : (
                <MapPinOff size={16} color="#71717a" />
              )
            }
            onPress={!isRecordingStarted ? handleGpsToggle : undefined}
            testID="record-gps-summary-button"
          />
          <SummaryRow
            label="Plan"
            value={activeHasPlan ? "Attached" : "None"}
            icon={<ArrowUpRight size={16} color="#71717a" />}
            onPress={!isRecordingStarted ? handlePlanPress : undefined}
            testID="record-plan-summary-button"
          />
          <SummaryRow
            label="Route"
            value={activeHasRoute ? "Attached via plan" : "None"}
            icon={<Route size={16} color="#71717a" />}
            onPress={!isRecordingStarted ? handleRoutePress : undefined}
            testID="record-route-summary-button"
          />
          {!isRecordingStarted && (
            <SummaryRow
              label="Sensors"
              value="Connect or review"
              icon={<WifiOff size={16} color="#71717a" />}
              onPress={handleSensorsPress}
              testID="record-sensors-summary-button"
            />
          )}
        </SectionCard>

        <SectionCard
          title="Adjust Workout"
          description="Trainer mode, session intensity, and source recovery stay here."
        >
          <View className="mb-4 rounded-2xl border border-border bg-background p-4">
            <View className="mb-3 flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">Trainer</Text>
                <Text className="mt-1 text-lg font-semibold text-foreground">
                  {trainerSensor?.name ?? trainerMachineLabel ?? "No trainer connected"}
                </Text>
                <Text className="mt-1 text-sm text-muted-foreground">{trainerSummary.status}</Text>
              </View>
              <View className="rounded-full bg-muted p-2">
                <Bluetooth size={16} color="#71717a" />
              </View>
            </View>

            <View className="mb-3 flex-row flex-wrap gap-2">
              <StatusPill
                label={bleState === "PoweredOn" ? "Bluetooth ready" : "Bluetooth blocked"}
                tone={bleState === "PoweredOn" ? "good" : "warn"}
              />
              <StatusPill
                label={
                  trainerDataFlowing
                    ? "Data flowing"
                    : trainerAvailable
                      ? "Waiting for data"
                      : "No data"
                }
                tone={trainerDataFlowing ? "good" : trainerAvailable ? "neutral" : "warn"}
              />
              <StatusPill
                label={trainerControlReady ? `Control ${trainerMode}` : "Control unavailable"}
                tone={trainerControlReady ? "good" : "warn"}
              />
            </View>

            <Text className="mb-3 text-xs text-muted-foreground">{trainerSummary.detail}</Text>

            <Button onPress={handleTrainerPrimaryAction} className="w-full">
              <Text className="text-primary-foreground">{trainerSummary.actionLabel}</Text>
            </Button>

            {trainerControlReady && (
              <View className="mt-3 flex-row gap-2">
                <ModeChip
                  label="Auto"
                  active={trainerMode === "auto"}
                  onPress={() => handleTrainerModeChange("auto")}
                />
                <ModeChip
                  label="Manual"
                  active={trainerMode === "manual"}
                  onPress={() => handleTrainerModeChange("manual")}
                />
              </View>
            )}
          </View>

          <View className="mb-4">
            <IntensityScaling service={service} />
          </View>

          <View>
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-sm font-medium text-muted-foreground">Sources</Text>
              <Pressable onPress={handleSensorsPress}>
                <Text className="text-xs font-medium text-foreground">Manage sensors</Text>
              </Pressable>
            </View>

            {runtimeSourceState?.degradedState.isDegraded && (
              <Badge variant="secondary" className="mb-3 self-start">
                <Text className="text-xs text-foreground">Source recovery recommended</Text>
              </Badge>
            )}

            {sourceMetrics.length > 0 ? (
              <View className="gap-3">
                {sourceMetrics.map(({ metricFamily, selection, candidates }) => (
                  <View
                    key={metricFamily}
                    className="rounded-lg border border-border bg-muted/40 p-3"
                  >
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-sm font-medium capitalize text-foreground">
                        {metricFamily.replace("_", " ")}
                      </Text>
                      <Text className="text-xs text-muted-foreground capitalize">
                        {selection?.provenance ?? "unavailable"}
                      </Text>
                    </View>
                    <Text className="mb-2 text-xs text-muted-foreground">
                      {selection?.sourceType?.replace(/_/g, " ") ??
                        selection?.sourceId ??
                        "No source selected"}
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {candidates.map((candidate) => {
                        const isPreferred = preferredSources[metricFamily] === candidate.sourceId;
                        const isSelected = selection?.sourceId === candidate.sourceId;

                        return (
                          <ModeChip
                            key={`${metricFamily}-${candidate.sourceId}`}
                            label={candidate.sourceType.replace(/_/g, " ")}
                            active={isPreferred || isSelected}
                            onPress={() =>
                              handlePreferredSourcePress(metricFamily, candidate.sourceId)
                            }
                          />
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-xs text-muted-foreground">
                {runtimeSourceState?.degradedState.isDegraded
                  ? "Reconnect sensors to recover missing data sources."
                  : "Sources are stable for this session."}
              </Text>
            )}
          </View>
        </SectionCard>
        {isRecordingStarted && (
          <Text className="mt-4 px-1 text-xs text-muted-foreground">
            Plan, route, category, and GPS identity stay fixed until this workout ends.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

type TrainerSummaryTone = "good" | "neutral" | "warn";

function hasRecentTrainerData(
  lastUpdated: { power?: number; cadence?: number; speed?: number } | undefined,
) {
  if (!lastUpdated) {
    return false;
  }

  const now = Date.now();
  return [lastUpdated.power, lastUpdated.cadence, lastUpdated.speed].some(
    (timestamp) => typeof timestamp === "number" && now - timestamp < 10000,
  );
}

function getTrainerSummary({
  bleState,
  trainerAvailable,
  trainerControlReady,
  trainerDataFlowing,
  recoveryState,
  commandFailed,
}: {
  bleState: string;
  trainerAvailable: boolean;
  trainerControlReady: boolean;
  trainerDataFlowing: boolean;
  recoveryState: "idle" | "applying_reconnect_recovery" | "recovered" | "failed";
  commandFailed: boolean;
}) {
  if (bleState === "PoweredOff") {
    return {
      status: "Bluetooth off",
      detail: "Turn Bluetooth back on before trying to reconnect your trainer.",
      action: "sensors" as const,
      actionLabel: "Open Sensors",
    };
  }

  if (bleState === "Unauthorized") {
    return {
      status: "Bluetooth permission needed",
      detail: "Grant Bluetooth access so the app can scan for and reconnect to your trainer.",
      action: "sensors" as const,
      actionLabel: "Open Sensors",
    };
  }

  if (recoveryState === "applying_reconnect_recovery") {
    return {
      status: "Trainer lost connection. Reconnecting",
      detail: "Keep this screen open while the app restores trainer control and live data.",
      action: "sensors" as const,
      actionLabel: "Open Sensors",
    };
  }

  if (recoveryState === "failed") {
    return {
      status: "Reconnect failed",
      detail: "Use the sensors screen to reconnect the trainer and retry control setup.",
      action: "sensors" as const,
      actionLabel: "Reconnect",
    };
  }

  if (!trainerAvailable) {
    return {
      status: "No trainer connected",
      detail: "Connect your trainer first, then come back here for mode changes or manual control.",
      action: "sensors" as const,
      actionLabel: "Connect",
    };
  }

  if (commandFailed) {
    return {
      status: "Connected, but control unavailable",
      detail:
        "Another app may already own trainer control, or the trainer may need a clean reconnect.",
      action: "sensors" as const,
      actionLabel: "Reconnect",
    };
  }

  if (trainerControlReady) {
    return {
      status: "Trainer control ready",
      detail:
        "Control is available now. Open controls only when you need to change trainer behavior.",
      action: "controls" as const,
      actionLabel: "Open Controls",
    };
  }

  if (trainerDataFlowing) {
    return {
      status: "Receiving trainer data",
      detail: "Metrics are arriving, but control still needs to finish setting up.",
      action: "sensors" as const,
      actionLabel: "Open Sensors",
    };
  }

  return {
    status: "Trainer connected",
    detail: "The trainer is connected. Wait for live data or reconnect if it stays idle.",
    action: "sensors" as const,
    actionLabel: "Open Sensors",
  };
}

function StatusPill({ label, tone }: { label: string; tone: TrainerSummaryTone }) {
  const toneClassName =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/10"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-border bg-muted/40";
  const textClassName =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-muted-foreground";

  return (
    <View className={`rounded-full border px-3 py-1 ${toneClassName}`}>
      <Text className={`text-xs font-medium ${textClassName}`}>{label}</Text>
    </View>
  );
}

interface SectionCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <View className="mb-4 rounded-2xl border border-border bg-card p-4">
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      <Text className="mb-4 mt-1 text-xs text-muted-foreground">{description}</Text>
      <View className="gap-3">{children}</View>
    </View>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}

function SummaryRow({ label, value, icon, onPress, testID }: SummaryRowProps) {
  const Container = onPress ? Pressable : View;

  return (
    <Container
      {...(onPress ? { onPress } : {})}
      className="flex-row items-center justify-between rounded-xl border border-border bg-background px-3 py-3"
      testID={testID}
    >
      <View className="flex-row items-center gap-3">
        <View className="rounded-full bg-muted p-2">{icon}</View>
        <View>
          <Text className="text-xs text-muted-foreground">{label}</Text>
          <Text className="text-sm font-medium capitalize text-foreground">{value}</Text>
        </View>
      </View>
      <Text className="text-xs font-medium text-muted-foreground">
        {onPress ? "Edit" : "Locked"}
      </Text>
    </Container>
  );
}

interface ModeChipProps {
  label: string;
  onPress: () => void;
  active: boolean;
}

function ModeChip({ label, onPress, active }: ModeChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-3 py-2 ${
        active ? "border-foreground bg-foreground" : "border-border bg-background"
      }`}
    >
      <Text
        className={
          active ? "text-xs font-medium text-background" : "text-xs font-medium text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
