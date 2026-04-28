import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { AlertTriangle, Battery, Bluetooth, RefreshCw, Zap } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import type { Device } from "react-native-ble-plx";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  useBleState,
  useRecorderActions,
  useSensors,
  useSessionView,
} from "@/lib/hooks/useActivityRecorder";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import {
  type AllPermissionsStatus,
  checkAllPermissions,
  requestPermission,
} from "@/lib/services/permissions-check";

function SensorsScreen() {
  const service = useSharedActivityRecorder();
  const { sensors: connectedSensors } = useSensors(service);
  const sessionView = useSessionView(service);
  const bleState = useBleState(service);
  const { startScan, stopScan, subscribeScan, connectDevice, disconnectDevice, resetSensors } =
    useRecorderActions(service);

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

        if (!isAlreadyAdded && !isConnected) {
          return [...prev, device];
        }

        return prev;
      });
    });

    return unsubscribe;
  }, [connectedSensors, service, subscribeScan]);

  useEffect(() => {
    setAvailableDevices((prev) =>
      prev.filter((device) => !connectedSensors.some((sensor) => sensor.id === device.id)),
    );
  }, [connectedSensors]);

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

  const handleStartScan = useCallback(async () => {
    if (!bluetoothGranted) {
      if (bluetoothCanAsk) {
        await requestBluetoothPermission();
      }
      return;
    }

    if (bleState === "PoweredOff") {
      setScanError("Bluetooth is off. Turn it on before scanning for your trainer.");
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
        setScanError("Bluetooth is off. Turn it on before scanning for your trainer.");
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
    bluetoothGranted,
    bluetoothCanAsk,
    bleState,
    scanError,
    trainerRecoveryState: sessionView?.trainer.recoveryState ?? "idle",
    trainerCommandError: sessionView?.trainer.lastCommandStatus?.success === false,
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
        {trainerFailure && (
          <InlineIssueCard
            title={trainerFailure.title}
            actionLabel={trainerFailure.actionLabel}
            onPress={
              trainerFailure.action === "permission"
                ? requestBluetoothPermission
                : trainerFailure.action === "reset"
                  ? handleResetSensors
                  : handleStartScan
            }
          />
        )}

        {connectedSensors.length > 0 && (
          <View className="rounded-2xl border border-border bg-card p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-foreground">
                Connected ({connectedSensors.length})
              </Text>
              <Button size="sm" variant="ghost" onPress={handleResetSensors} className="h-8 px-2">
                <Text className="text-xs text-red-600">Reset all</Text>
              </Button>
            </View>

            <View className="gap-3">
              {connectedSensors.map((sensor) => (
                <View key={sensor.id} className="rounded-xl border border-border bg-background p-3">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-sm font-medium text-foreground">{sensor.name}</Text>
                        {sensor.isControllable && (
                          <View className="flex-row items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1">
                            <Icon as={Zap} size={12} className="text-emerald-700" />
                            <Text className="text-xs font-medium text-emerald-700">
                              Control ready
                            </Text>
                          </View>
                        )}
                      </View>
                      {sensor.batteryLevel !== undefined && (
                        <View className="mt-2 flex-row items-center gap-1">
                          <Icon
                            as={Battery}
                            size={14}
                            className={getBatteryColorClassName(sensor.batteryLevel)}
                          />
                          <Text
                            className={`text-xs ${getBatteryColorClassName(sensor.batteryLevel)}`}
                          >
                            {sensor.batteryLevel}% battery
                          </Text>
                        </View>
                      )}
                    </View>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => handleDisconnectDevice(sensor.id)}
                      className="h-8"
                    >
                      <Text className="text-xs text-muted-foreground">Disconnect</Text>
                    </Button>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

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
      </ScrollView>
    </View>
  );
}

function getTrainerFailure({
  bluetoothGranted,
  bluetoothCanAsk,
  bleState,
  scanError,
  trainerRecoveryState,
  trainerCommandError,
  connectErrors,
}: {
  bluetoothGranted: boolean;
  bluetoothCanAsk: boolean;
  bleState: string;
  scanError: string | null;
  trainerRecoveryState: "idle" | "applying_reconnect_recovery" | "recovered" | "failed";
  trainerCommandError: boolean;
  connectErrors: Record<string, string>;
}) {
  if (!bluetoothGranted) {
    return {
      title: bluetoothCanAsk ? "Bluetooth permission needed" : "Bluetooth blocked in settings",
      action: bluetoothCanAsk ? ("permission" as const) : ("scan" as const),
      actionLabel: bluetoothCanAsk ? "Grant access" : "Try again",
    };
  }

  if (bleState === "PoweredOff") {
    return {
      title: "Bluetooth off",
      action: "scan" as const,
      actionLabel: "Try again",
    };
  }

  if (trainerRecoveryState === "failed") {
    return {
      title: "Reconnect failed",
      action: "scan" as const,
      actionLabel: "Reconnect",
    };
  }

  if (trainerCommandError) {
    return {
      title: "Connected, but control is unavailable",
      action: "reset" as const,
      actionLabel: "Reset sensors",
    };
  }

  if (scanError) {
    return {
      title: "Scan issue",
      action: "scan" as const,
      actionLabel: "Scan again",
    };
  }

  const firstConnectError = Object.values(connectErrors)[0];
  if (firstConnectError) {
    return {
      title: "Trainer connection failed",
      action: "scan" as const,
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

function EmptyListState({ title }: { title: string }) {
  return (
    <View className="items-center rounded-xl border border-dashed border-border bg-background px-4 py-6">
      <Icon as={Bluetooth} size={28} className="text-muted-foreground" />
      <Text className="mt-2 text-sm font-semibold text-muted-foreground">{title}</Text>
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
