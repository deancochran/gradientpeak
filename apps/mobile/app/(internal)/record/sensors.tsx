import type { MetricFamily, MetricSourceCandidate, MetricSourceSelection } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import {
  AlertTriangle,
  Battery,
  Bluetooth,
  BluetoothOff,
  RefreshCw,
  Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import type { Device } from "react-native-ble-plx";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  useBleState,
  useKnownSensors,
  useRecorderActions,
  useSensors,
  useSessionView,
} from "@/lib/hooks/useActivityRecorder";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import type { ConnectedSensor, PersistedSensor } from "@/lib/services/ActivityRecorder/sensors";
import {
  type AllPermissionsStatus,
  checkAllPermissions,
  requestPermission,
} from "@/lib/services/permissions-check";

function SensorsScreen() {
  const service = useSharedActivityRecorder();
  const { sensors: connectedSensors } = useSensors(service);
  const knownSensors = useKnownSensors(service);
  const sessionView = useSessionView(service);
  const bleState = useBleState(service);
  const {
    startScan,
    stopScan,
    subscribeScan,
    connectDevice,
    disconnectDevice,
    forgetDevice,
    resetSensors,
    setPreferredMetricSource,
    clearPreferredMetricSource,
    disableMetricSource,
    enableMetricSource,
  } = useRecorderActions(service);

  const [permissions, setPermissions] = useState<AllPermissionsStatus | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [connectingDevices, setConnectingDevices] = useState<Set<string>>(new Set());
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [connectErrors, setConnectErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!service) return;

    const unsubscribe = subscribeScan((device) => {
      setAvailableDevices((prev) => {
        const isAlreadyAdded = prev.some((candidate) => candidate.id === device.id);
        const isConnected = connectedSensors.some((sensor) => sensor.id === device.id);
        const isKnown = knownSensors.some((sensor) => sensor.id === device.id);

        if (!isAlreadyAdded && !isConnected && !isKnown) {
          return [...prev, device];
        }

        return prev;
      });
    });

    return unsubscribe;
  }, [connectedSensors, knownSensors, service, subscribeScan]);

  useEffect(() => {
    setAvailableDevices((prev) =>
      prev.filter(
        (device) =>
          !connectedSensors.some((sensor) => sensor.id === device.id) &&
          !knownSensors.some((sensor) => sensor.id === device.id),
      ),
    );
  }, [connectedSensors, knownSensors]);

  useEffect(() => {
    return () => {
      if (isScanning) {
        stopScan();
      }
    };
  }, [isScanning, stopScan]);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        setPermissions(await checkAllPermissions());
      } catch (error) {
        console.error("Failed to check permissions:", error);
      }
    };

    loadPermissions();
  }, []);

  const refreshPermissions = useCallback(async () => {
    try {
      setPermissions(await checkAllPermissions());
    } catch (error) {
      console.error("Failed to refresh permissions:", error);
    }
  }, []);

  const requestBluetoothPermission = useCallback(async () => {
    if (isRequestingPermission) return;

    setIsRequestingPermission(true);
    try {
      const granted = await requestPermission("bluetooth");
      if (granted) {
        await refreshPermissions();
      }
    } catch (error) {
      console.error("Failed to request bluetooth permission:", error);
    } finally {
      setIsRequestingPermission(false);
    }
  }, [isRequestingPermission, refreshPermissions]);

  const bluetoothGranted = permissions?.bluetooth?.granted ?? false;
  const bluetoothCanAsk = permissions?.bluetooth?.canAskAgain ?? false;
  const readinessIssue = getReadinessIssue({ bluetoothGranted, bluetoothCanAsk, bleState });
  const metricSources = service?.getAvailableMetricSources() ?? [];
  const selectedSources = sessionView?.runtimeSourceState.selectedSources ?? [];
  const preferredSources = sessionView?.overrideState.preferredSources ?? {};
  const disabledSources = sessionView?.overrideState.disabledSources ?? {};
  const connectedSensorIds = new Set(connectedSensors.map((sensor) => sensor.id));
  const disconnectedKnownSensors = knownSensors.filter(
    (sensor) => !connectedSensorIds.has(sensor.id),
  );
  const metricSourcesBySensorId = groupMetricSourcesBySensorId(metricSources);
  const selectedSourceByMetricFamily = groupSelectedSourcesByMetricFamily(selectedSources);

  const handleStartScan = useCallback(async () => {
    if (!bluetoothGranted) {
      if (bluetoothCanAsk) {
        await requestBluetoothPermission();
      }
      return;
    }

    if (bleState === "PoweredOff") {
      setScanError("Bluetooth is off. Turn it on before scanning for sensors.");
      return;
    }

    if (bleState === "Unauthorized") {
      setScanError("Bluetooth access is blocked. Allow access in system settings.");
      return;
    }

    if (bleState !== "PoweredOn") {
      setScanError(`Bluetooth is not ready yet (${bleState}). Wait a moment and try again.`);
      return;
    }

    setScanError(null);
    setIsScanning(true);
    setAvailableDevices([]);

    try {
      await startScan();
    } catch (error: any) {
      console.error("Scan failed:", error);
      const errorMsg = error?.message || String(error);
      if (errorMsg.toLowerCase().includes("powered off")) {
        setScanError("Bluetooth is off. Turn it on before scanning for sensors.");
      } else if (errorMsg.toLowerCase().includes("unauthorized")) {
        setScanError("Bluetooth access is blocked. Allow access in system settings.");
      } else {
        setScanError(`Scan failed. ${errorMsg}`);
      }
    } finally {
      setIsScanning(false);
    }
  }, [bleState, bluetoothCanAsk, bluetoothGranted, requestBluetoothPermission, startScan]);

  const handleStopScan = useCallback(() => {
    stopScan();
    setIsScanning(false);
  }, [stopScan]);

  const handleConnectDevice = useCallback(
    async (device: Device) => {
      if (connectingDevices.has(device.id)) return;

      setConnectingDevices((prev) => new Set(prev).add(device.id));
      setConnectErrors((prev) => {
        const next = { ...prev };
        delete next[device.id];
        return next;
      });

      try {
        await connectDevice(device.id);
      } catch (error: any) {
        console.error("Connection failed:", error);
        const errorMessage = error?.message || "Connection failed. Move closer and try again.";
        setConnectErrors((prev) => ({ ...prev, [device.id]: errorMessage || "Connection failed" }));
      } finally {
        setConnectingDevices((prev) => {
          const next = new Set(prev);
          next.delete(device.id);
          return next;
        });
      }
    },
    [connectDevice, connectingDevices],
  );

  const handleDisconnectDevice = useCallback(
    async (deviceId: string) => {
      try {
        await disconnectDevice(deviceId);
      } catch (error) {
        console.error("Disconnection failed:", error);
      }
    },
    [disconnectDevice],
  );

  const handleForgetDevice = useCallback(
    async (deviceId: string) => {
      try {
        await forgetDevice(deviceId);
      } catch (error) {
        console.error("Forget sensor failed:", error);
      }
    },
    [forgetDevice],
  );

  const handleResetSensors = useCallback(async () => {
    try {
      await resetSensors();
      setScanError(null);
      setConnectErrors({});
    } catch (error) {
      console.error("Failed to reset sensors:", error);
    }
  }, [resetSensors]);

  const trainerFailure = getTrainerFailure({
    scanError,
    trainerRecoveryState: sessionView?.trainer.recoveryState ?? "idle",
    connectErrors,
  });

  if (!permissions) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border bg-card px-4 py-3">
        <Button
          onPress={isScanning ? handleStopScan : handleStartScan}
          disabled={!bluetoothGranted || (bleState !== "PoweredOn" && bleState !== "Unknown")}
          className="w-full"
        >
          <View className="flex-row items-center gap-2">
            {isScanning ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Icon as={RefreshCw} size={16} className="text-primary-foreground" />
            )}
            <Text className="text-primary-foreground">
              {isScanning ? "Scanning for sensors" : "Scan for sensors"}
            </Text>
          </View>
        </Button>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4">
        {readinessIssue ? (
          <EmptyListState
            title={readinessIssue.title}
            description={readinessIssue.description}
            actionLabel={readinessIssue.action === "permission" ? "Grant access" : undefined}
            onAction={
              readinessIssue.action === "permission" ? requestBluetoothPermission : undefined
            }
          />
        ) : trainerFailure ? (
          <InlineIssueCard
            title={trainerFailure.title}
            actionLabel={trainerFailure.actionLabel}
            onPress={handleStartScan}
          />
        ) : null}

        {!readinessIssue && connectedSensors.length > 0 && (
          <View className="rounded-2xl border border-border bg-card p-4">
            <Text className="mb-3 text-sm font-semibold text-foreground">
              Connected ({connectedSensors.length})
            </Text>

            <View className="gap-3">
              {connectedSensors.map((sensor) => (
                <ConnectedSensorCard
                  key={sensor.id}
                  sensor={sensor}
                  candidates={metricSourcesBySensorId.get(sensor.id) ?? []}
                  selectedSourceByMetricFamily={selectedSourceByMetricFamily}
                  preferredSources={preferredSources}
                  disabledSources={disabledSources}
                  onSelect={setPreferredMetricSource}
                  onClear={clearPreferredMetricSource}
                  onDisable={disableMetricSource}
                  onEnable={enableMetricSource}
                  onDisconnect={handleDisconnectDevice}
                />
              ))}
            </View>
          </View>
        )}

        {!readinessIssue && (
          <View className="rounded-2xl border border-border bg-card p-4">
            <Text className="text-sm font-semibold text-foreground">
              Known Sensors ({disconnectedKnownSensors.length})
            </Text>

            <View className="mt-3 gap-3">
              {disconnectedKnownSensors.length === 0 ? (
                <EmptyListState title="No known sensors yet" />
              ) : (
                disconnectedKnownSensors.map((sensor) => (
                  <KnownSensorRow
                    key={sensor.id}
                    sensor={sensor}
                    isConnecting={connectingDevices.has(sensor.id)}
                    onConnect={connectDevice}
                    onForget={handleForgetDevice}
                  />
                ))
              )}
            </View>
          </View>
        )}

        {!readinessIssue && (
          <View className="rounded-2xl border border-border bg-card p-4">
            <Text className="text-sm font-semibold text-foreground">
              Nearby ({availableDevices.length})
            </Text>

            <View className="mt-3 gap-3">
              {!bluetoothGranted ? (
                <EmptyListState title="Bluetooth permission needed" />
              ) : availableDevices.length === 0 && !isScanning ? (
                <EmptyListState title="No nearby sensors" />
              ) : (
                availableDevices.map((device) => {
                  const isConnecting = connectingDevices.has(device.id);
                  const connectError = connectErrors[device.id];

                  return (
                    <View
                      key={device.id}
                      className="rounded-xl border border-border bg-background p-3"
                    >
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-foreground">
                            {device.name || "Unknown device"}
                          </Text>
                          {device.id && (
                            <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={1}>
                              {device.id}
                            </Text>
                          )}
                          {connectError && (
                            <Text className="mt-2 text-xs text-red-700">{connectError}</Text>
                          )}
                        </View>
                        <Button
                          size="sm"
                          onPress={() => handleConnectDevice(device)}
                          disabled={isConnecting}
                          className="h-8"
                        >
                          {isConnecting ? (
                            <ActivityIndicator size="small" color="white" />
                          ) : (
                            <Text className="text-xs text-primary-foreground">Connect</Text>
                          )}
                        </Button>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}

        {!readinessIssue && (connectedSensors.length > 0 || knownSensors.length > 0) && (
          <TroubleshootingCard onReset={handleResetSensors} />
        )}
      </ScrollView>
    </View>
  );
}

function TroubleshootingCard({ onReset }: { onReset: () => void | Promise<void> }) {
  return (
    <View className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
      <View className="flex-row items-start gap-3">
        <Icon as={AlertTriangle} size={18} className="mt-0.5 text-red-700" />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-red-900">Sensor setup stuck?</Text>
          <Text className="mt-1 text-xs text-red-900/80">
            Reset sensor setup disconnects all sensors and forgets known devices. Use this only if
            connections are stuck or showing the wrong devices.
          </Text>
          <Button size="sm" variant="ghost" onPress={onReset} className="mt-3 h-8 self-start px-0">
            <Text className="text-xs font-medium text-red-700">Reset sensor setup</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}

function getReadinessIssue({
  bluetoothGranted,
  bluetoothCanAsk,
  bleState,
}: {
  bluetoothGranted: boolean;
  bluetoothCanAsk: boolean;
  bleState: string;
}) {
  if (!bluetoothGranted) {
    return {
      title: bluetoothCanAsk ? "Bluetooth permission needed" : "Bluetooth blocked in settings",
      description: "Bluetooth permission is needed to find and connect sensors.",
      action: bluetoothCanAsk ? ("permission" as const) : ("settings" as const),
    };
  }

  if (bleState === "PoweredOff") {
    return {
      title: "Bluetooth is turned off",
      description: "Turn Bluetooth on to connect sensors.",
      action: "none" as const,
    };
  }

  if (bleState === "Unauthorized") {
    return {
      title: "Bluetooth access is blocked",
      description: "Allow Bluetooth access in system settings to connect sensors.",
      action: "settings" as const,
    };
  }

  if (bleState === "Unsupported") {
    return {
      title: "Bluetooth sensors are not supported on this device",
      description: "Use a device with Bluetooth sensor support to connect sensors.",
      action: "none" as const,
    };
  }

  return null;
}

function KnownSensorRow({
  sensor,
  isConnecting,
  onConnect,
  onForget,
}: {
  sensor: PersistedSensor;
  isConnecting: boolean;
  onConnect: (deviceId: string) => Promise<void>;
  onForget: (deviceId: string) => Promise<void>;
}) {
  return (
    <View className="rounded-xl border border-border bg-background p-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-medium text-foreground">{sensor.name}</Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            Last connected {formatLastConnected(sensor.lastConnected)}
          </Text>
        </View>
        <View className="items-end gap-2">
          <Button
            size="sm"
            onPress={() => onConnect(sensor.id)}
            disabled={isConnecting}
            className="h-8"
          >
            {isConnecting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-xs text-primary-foreground">Connect</Text>
            )}
          </Button>
          <Button size="sm" variant="ghost" onPress={() => onForget(sensor.id)} className="h-8">
            <Text className="text-xs text-red-600">Forget</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}

function ConnectedSensorCard({
  sensor,
  candidates,
  selectedSourceByMetricFamily,
  preferredSources,
  disabledSources,
  onSelect,
  onClear,
  onDisable,
  onEnable,
  onDisconnect,
}: {
  sensor: ConnectedSensor;
  candidates: MetricSourceCandidate[];
  selectedSourceByMetricFamily: Map<MetricFamily, MetricSourceSelection>;
  preferredSources: Partial<Record<MetricFamily, string>>;
  disabledSources: Partial<Record<MetricFamily, string[]>>;
  onSelect: (metricFamily: MetricFamily, sourceId: string) => void;
  onClear: (metricFamily: MetricFamily) => void;
  onDisable: (metricFamily: MetricFamily, sourceId: string) => void;
  onEnable: (metricFamily: MetricFamily, sourceId: string) => void;
  onDisconnect: (deviceId: string) => Promise<void>;
}) {
  return (
    <View className="rounded-xl border border-border bg-background p-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
              {sensor.name}
            </Text>
            {typeof sensor.batteryLevel === "number" && (
              <View className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-1">
                <Icon
                  as={Battery}
                  size={12}
                  className={getBatteryColorClassName(sensor.batteryLevel)}
                />
                <Text
                  className={`text-xs font-medium ${getBatteryColorClassName(sensor.batteryLevel)}`}
                >
                  {sensor.batteryLevel}%
                </Text>
              </View>
            )}
            {sensor.isTrainer && (
              <View className="flex-row items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1">
                <Icon as={Zap} size={12} className="text-emerald-700" />
                <Text className="text-xs font-medium text-emerald-700">Trainer</Text>
              </View>
            )}
          </View>
        </View>

        <View className="flex-row items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onPress={() => onDisconnect(sensor.id)}
            className="h-9 w-9"
            accessibilityLabel={`Disconnect ${sensor.name}`}
          >
            <Icon as={BluetoothOff} size={16} className="text-muted-foreground" />
          </Button>
        </View>
      </View>

      <MetricSourceRows
        sensor={sensor}
        candidates={candidates}
        selectedSourceByMetricFamily={selectedSourceByMetricFamily}
        preferredSources={preferredSources}
        disabledSources={disabledSources}
        onSelect={onSelect}
        onClear={onClear}
        onDisable={onDisable}
        onEnable={onEnable}
      />
    </View>
  );
}

function MetricSourceRows({
  sensor,
  candidates,
  selectedSourceByMetricFamily,
  preferredSources,
  disabledSources,
  onSelect,
  onClear,
  onDisable,
  onEnable,
}: {
  sensor: ConnectedSensor;
  candidates: MetricSourceCandidate[];
  selectedSourceByMetricFamily: Map<MetricFamily, MetricSourceSelection>;
  preferredSources: Partial<Record<MetricFamily, string>>;
  disabledSources: Partial<Record<MetricFamily, string[]>>;
  onSelect: (metricFamily: MetricFamily, sourceId: string) => void;
  onClear: (metricFamily: MetricFamily) => void;
  onDisable: (metricFamily: MetricFamily, sourceId: string) => void;
  onEnable: (metricFamily: MetricFamily, sourceId: string) => void;
}) {
  if (candidates.length === 0) {
    return (
      <Text className="mt-2 text-xs text-muted-foreground">Connected, no supported readings</Text>
    );
  }

  return (
    <View className="mt-3 flex-row flex-wrap gap-2">
      {candidates.map((candidate) => {
        const selected = selectedSourceByMetricFamily.get(candidate.metricFamily);
        const isAuthoritative = selected?.sourceId === sensor.id;
        const isPreferred = preferredSources[candidate.metricFamily] === sensor.id;
        const isDisabled = (disabledSources[candidate.metricFamily] ?? []).includes(sensor.id);

        return (
          <Button
            key={`${candidate.metricFamily}:${candidate.sourceType}`}
            size="sm"
            variant={isAuthoritative ? "default" : "outline"}
            accessibilityRole="switch"
            accessibilityState={{ checked: isAuthoritative && !isDisabled }}
            accessibilityLabel={`${getMetricLabel(candidate.metricFamily)} source for ${sensor.name}`}
            onPress={() => {
              if (isDisabled) {
                onEnable(candidate.metricFamily, sensor.id);
                return;
              }

              if (isAuthoritative || isPreferred) {
                onDisable(candidate.metricFamily, sensor.id);
                return;
              }

              onSelect(candidate.metricFamily, sensor.id);
            }}
            className="h-8 px-2"
          >
            <Text
              className={`text-xs ${isAuthoritative && !isDisabled ? "text-primary-foreground" : "text-foreground"}`}
            >
              {getShortMetricLabel(candidate.metricFamily)}{" "}
              {isAuthoritative && !isDisabled ? "on" : "off"}
            </Text>
          </Button>
        );
      })}
    </View>
  );
}

function groupMetricSourcesBySensorId(candidates: MetricSourceCandidate[]) {
  const grouped = new Map<string, MetricSourceCandidate[]>();

  for (const candidate of candidates) {
    const sensorCandidates = grouped.get(candidate.sourceId) ?? [];
    sensorCandidates.push(candidate);
    grouped.set(candidate.sourceId, sensorCandidates);
  }

  return grouped;
}

function groupSelectedSourcesByMetricFamily(selectedSources: MetricSourceSelection[]) {
  const grouped = new Map<MetricFamily, MetricSourceSelection>();

  for (const source of selectedSources) {
    grouped.set(source.metricFamily, source);
  }

  return grouped;
}

function getMetricLabel(metricFamily: MetricFamily): string {
  switch (metricFamily) {
    case "heart_rate":
      return "Heart Rate";
    case "power":
      return "Power";
    case "cadence":
      return "Cadence";
    case "speed":
      return "Speed";
    case "distance":
      return "Distance";
    case "position":
      return "Position";
    case "elevation":
      return "Elevation";
  }
}

function getShortMetricLabel(metricFamily: MetricFamily): string {
  return metricFamily === "heart_rate" ? "HR" : getMetricLabel(metricFamily);
}

function formatLastConnected(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "previously";

  const elapsedMs = Date.now() - timestamp;
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));

  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  return `${Math.round(elapsedHours / 24)}d ago`;
}

function getTrainerFailure({
  scanError,
  trainerRecoveryState,
  connectErrors,
}: {
  scanError: string | null;
  trainerRecoveryState: "idle" | "applying_reconnect_recovery" | "recovered" | "failed";
  connectErrors: Record<string, string>;
}) {
  if (trainerRecoveryState === "failed") {
    return {
      title: "Reconnect failed",
      actionLabel: "Reconnect",
    };
  }

  if (scanError) {
    return {
      title: "Scan issue",
      actionLabel: "Scan again",
    };
  }

  const firstConnectError = Object.values(connectErrors)[0];
  if (firstConnectError) {
    return {
      title: "Sensor connection failed",
      actionLabel: "Scan again",
    };
  }

  return null;
}

function getBatteryColorClassName(level: number) {
  if (level > 20) return "text-emerald-700";
  if (level > 10) return "text-amber-700";
  return "text-red-700";
}

function EmptyListState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}) {
  return (
    <View className="items-center rounded-xl border border-dashed border-border bg-background px-4 py-6">
      <Icon as={Bluetooth} size={28} className="text-muted-foreground" />
      <Text className="mt-2 text-sm font-semibold text-muted-foreground">{title}</Text>
      {description && (
        <Text className="mt-1 text-center text-xs text-muted-foreground">{description}</Text>
      )}
      {actionLabel && onAction && (
        <Button onPress={onAction} size="sm" className="mt-3">
          <Text className="text-xs text-primary-foreground">{actionLabel}</Text>
        </Button>
      )}
    </View>
  );
}

function InlineIssueCard({
  title,
  actionLabel,
  onPress,
}: {
  title: string;
  actionLabel: string;
  onPress: () => void | Promise<void>;
}) {
  return (
    <View className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
      <View className="flex-row items-start gap-3">
        <Icon as={AlertTriangle} size={18} className="mt-0.5 text-red-700" />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-red-900">{title}</Text>
          <Button onPress={onPress} size="sm" className="mt-2 self-start">
            <Text className="text-xs text-primary-foreground">{actionLabel}</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}

export default function SensorsScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <SensorsScreen />
    </ErrorBoundary>
  );
}
