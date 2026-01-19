import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useRecorderActions,
  useSensors,
} from "@/lib/hooks/useActivityRecorder";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import {
  checkAllPermissions,
  requestPermission,
  type AllPermissionsStatus,
} from "@/lib/services/permissions-check";
import { Battery, Bluetooth, RefreshCw, Zap } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import type { Device } from "react-native-ble-plx";

function SensorsScreen() {
  const service = useSharedActivityRecorder();
  const { sensors: connectedSensors } = useSensors(service);
  const {
    startScan,
    stopScan,
    subscribeScan,
    connectDevice,
    disconnectDevice,
  } = useRecorderActions(service);

  const [permissions, setPermissions] = useState<AllPermissionsStatus | null>(
    null,
  );
  const [isScanning, setIsScanning] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [connectingDevices, setConnectingDevices] = useState<Set<string>>(
    new Set(),
  );
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [bleState, setBleState] = useState<string>("Unknown");
  const [scanError, setScanError] = useState<string | null>(null);

  // Setup scan subscription to receive devices as they're discovered
  useEffect(() => {
    if (!service) return;

    const unsubscribe = subscribeScan((device) => {
      setAvailableDevices((prev) => {
        // Only add if not already in list and not connected
        const isAlreadyAdded = prev.some((d) => d.id === device.id);
        const isConnected = connectedSensors.some(
          (sensor) => sensor.id === device.id,
        );

        if (!isAlreadyAdded && !isConnected) {
          return [...prev, device];
        }
        return prev;
      });
    });

    return unsubscribe;
  }, [service, subscribeScan, connectedSensors]);

  // Remove devices from available list when they become connected
  useEffect(() => {
    setAvailableDevices((prev) =>
      prev.filter(
        (device) => !connectedSensors.some((sensor) => sensor.id === device.id),
      ),
    );
  }, [connectedSensors]);

  // Cleanup: stop scan when component unmounts
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
        const permissionStatus = await checkAllPermissions();
        setPermissions(permissionStatus);
      } catch (error) {
        console.error("Failed to check permissions:", error);
      }
    };

    loadPermissions();
  }, []);

  // Monitor BLE state
  useEffect(() => {
    if (!service) return;

    const checkBleState = () => {
      const state = service.sensorsManager.getBleState();
      setBleState(state);
    };

    // Check immediately
    checkBleState();

    // Check periodically
    const interval = setInterval(checkBleState, 2000);

    return () => clearInterval(interval);
  }, [service]);

  const refreshPermissions = useCallback(async () => {
    try {
      const permissionStatus = await checkAllPermissions();
      setPermissions(permissionStatus);
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

  const handleStartScan = async () => {
    const bluetoothGranted = permissions?.bluetooth?.granted;

    if (!bluetoothGranted) {
      if (permissions?.bluetooth?.canAskAgain) {
        await requestBluetoothPermission();
      }
      return;
    }

    // Check BLE state before scanning
    if (bleState === "PoweredOff") {
      setScanError("Bluetooth is turned off. Please enable Bluetooth in settings.");
      return;
    }

    if (bleState === "Unauthorized") {
      setScanError("Bluetooth access is not authorized. Please enable in settings.");
      return;
    }

    if (bleState !== "PoweredOn") {
      setScanError(`Bluetooth is not ready (${bleState}). Please wait or restart the app.`);
      return;
    }

    // Clear any previous errors
    setScanError(null);
    setIsScanning(true);
    // Clear available devices when starting a new scan
    setAvailableDevices([]);

    try {
      await startScan();
    } catch (error: any) {
      console.error("Scan failed:", error);
      const errorMsg = error?.message || String(error);
      if (errorMsg.toLowerCase().includes("powered off")) {
        setScanError("Bluetooth is powered off. Please enable Bluetooth in settings.");
      } else if (errorMsg.toLowerCase().includes("unauthorized")) {
        setScanError("Bluetooth permission denied. Please enable in settings.");
      } else {
        setScanError(`Scan failed: ${errorMsg}`);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleStopScan = () => {
    stopScan();
    setIsScanning(false);
  };

  const handleConnectDevice = async (device: Device) => {
    if (connectingDevices.has(device.id)) return;

    // Add to connecting set - device stays in Available list while connecting
    setConnectingDevices((prev) => new Set(prev).add(device.id));

    try {
      await connectDevice(device.id);
      // Device will be moved to Connected list by the useEffect that watches connectedSensors
    } catch (error) {
      console.error("Connection failed:", error);
      // Device stays in available list on failure
    } finally {
      setConnectingDevices((prev) => {
        const newSet = new Set(prev);
        newSet.delete(device.id);
        return newSet;
      });
    }
  };

  const handleDisconnectDevice = async (deviceId: string) => {
    try {
      await disconnectDevice(deviceId);
    } catch (error) {
      console.error("Disconnection failed:", error);
    }
  };

  const handleResetSensors = async () => {
    if (!service) return;
    try {
      await service.sensorsManager.resetAllSensors();
      console.log("All sensors reset successfully");
    } catch (error) {
      console.error("Failed to reset sensors:", error);
    }
  };

  if (!permissions) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const bluetoothGranted = permissions.bluetooth?.granted;
  const bluetoothCanAsk = permissions.bluetooth?.canAskAgain;

  return (
    <View className="flex-1 bg-background">
      {/* Scan Control Banner */}
      <View className="bg-card border-b border-border px-4 py-3">
        <Button
          onPress={isScanning ? handleStopScan : handleStartScan}
          disabled={!bluetoothGranted || (bleState !== "PoweredOn" && bleState !== "Unknown")}
          className="w-full"
        >
          {isScanning ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="white" />
              <Text className="text-primary-foreground">Scanning...</Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <Icon
                as={RefreshCw}
                size={16}
                className="text-primary-foreground"
              />
              <Text className="text-primary-foreground">Scan for Sensors</Text>
            </View>
          )}
        </Button>
      </View>

      <ScrollView className="flex-1">
        {/* Permission Banner */}
        {!bluetoothGranted && (
          <View className="px-4 py-4 bg-orange-500/10 border-b border-orange-500/20">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <Icon as={Bluetooth} size={20} className="text-orange-600" />
                <Text className="text-sm text-orange-700">
                  {bluetoothCanAsk
                    ? "Bluetooth permission needed"
                    : "Enable Bluetooth in settings"}
                </Text>
              </View>
              {bluetoothCanAsk && (
                <Button
                  size="sm"
                  onPress={requestBluetoothPermission}
                  disabled={isRequestingPermission}
                  className="bg-orange-600"
                >
                  <Text className="text-white text-xs">
                    {isRequestingPermission ? "..." : "Grant"}
                  </Text>
                </Button>
              )}
            </View>
          </View>
        )}

        {/* BLE State Error Banner */}
        {scanError && (
          <View className="px-4 py-4 bg-red-500/10 border-b border-red-500/20">
            <View className="flex-row items-center gap-3">
              <Icon as={Bluetooth} size={20} className="text-red-600" />
              <Text className="text-sm text-red-700 flex-1">{scanError}</Text>
            </View>
          </View>
        )}

        {/* BLE State Indicator (for debugging) */}
        {bleState !== "PoweredOn" && bleState !== "Unknown" && (
          <View className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
            <Text className="text-xs text-yellow-700">
              Bluetooth Status: {bleState}
            </Text>
          </View>
        )}

        {/* Connected Devices */}
        {connectedSensors.length > 0 && (
          <View className="px-4 py-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Connected ({connectedSensors.length})
              </Text>
              <Button
                size="sm"
                variant="ghost"
                onPress={handleResetSensors}
                className="h-7 px-2"
              >
                <Text className="text-xs text-red-600">Reset All</Text>
              </Button>
            </View>
            {connectedSensors.map((sensor) => (
              <View
                key={sensor.id}
                className="flex-row items-center justify-between py-3 border-b border-border"
              >
                <View className="flex-row items-center gap-3 flex-1">
                  <View className="w-2 h-2 rounded-full bg-green-500" />
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-medium">{sensor.name}</Text>
                      {/* Battery indicator */}
                      {sensor.batteryLevel !== undefined && (
                        <View className="flex-row items-center gap-1">
                          <Icon
                            as={Battery}
                            size={14}
                            className={
                              sensor.batteryLevel > 20
                                ? "text-green-600"
                                : sensor.batteryLevel > 10
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }
                          />
                          <Text
                            className={`text-xs ${
                              sensor.batteryLevel > 20
                                ? "text-green-600"
                                : sensor.batteryLevel > 10
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }`}
                          >
                            {sensor.batteryLevel}%
                          </Text>
                        </View>
                      )}
                      {/* Control badge */}
                      {sensor.isControllable && (
                        <View className="bg-green-500/20 px-2 py-1 rounded flex-row items-center gap-1">
                          <Icon as={Zap} size={12} className="text-green-600" />
                          <Text className="text-xs text-green-600 font-medium">
                            Control
                          </Text>
                        </View>
                      )}
                    </View>
                    {/* Show current control mode if controllable */}
                    {sensor.isControllable &&
                      (() => {
                        const controller =
                          service?.sensorsManager.getFTMSController(sensor.id);
                        const mode = controller?.getCurrentMode();
                        if (mode) {
                          return (
                            <Text className="text-xs text-muted-foreground mt-1">
                              Mode: {mode}
                            </Text>
                          );
                        }
                        return null;
                      })()}
                  </View>
                </View>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => handleDisconnectDevice(sensor.id)}
                  className="h-8"
                >
                  <Text className="text-xs text-muted-foreground">
                    Disconnect
                  </Text>
                </Button>
              </View>
            ))}
          </View>
        )}

        {/* Available Devices */}
        <View className="px-4 py-4">
          <Text className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Available
          </Text>

          {!bluetoothGranted ? (
            <View className="py-12 items-center">
              <Icon
                as={Bluetooth}
                size={40}
                className="text-muted-foreground/40 mb-3"
              />
              <Text className="text-sm text-muted-foreground">
                Grant permission to scan
              </Text>
            </View>
          ) : availableDevices.length === 0 && !isScanning ? (
            <View className="py-12 items-center">
              <Icon
                as={Bluetooth}
                size={40}
                className="text-muted-foreground/40 mb-3"
              />
              <Text className="text-sm text-muted-foreground mb-1">
                No devices found
              </Text>
              <Text className="text-xs text-muted-foreground/60">
                {isScanning ? "Searching..." : "Tap scan to search"}
              </Text>
            </View>
          ) : (
            availableDevices.map((device) => {
              const isConnecting = connectingDevices.has(device.id);
              return (
                <View
                  key={device.id}
                  className="flex-row items-center justify-between py-3 border-b border-border"
                >
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-medium">
                        {device.name || "Unknown Device"}
                      </Text>
                      {/* Check if this is a connected sensor with controllable flag */}
                      {(() => {
                        const connectedSensor = connectedSensors.find(
                          (s) => s.id === device.id,
                        );
                        if (connectedSensor?.isControllable) {
                          return (
                            <View className="bg-green-500/20 px-2 py-1 rounded flex-row items-center gap-1">
                              <Icon
                                as={Zap}
                                size={12}
                                className="text-green-600"
                              />
                              <Text className="text-xs text-green-600 font-medium">
                                Control
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })()}
                    </View>
                    {device.id && (
                      <Text
                        className="text-xs text-muted-foreground mt-0.5"
                        numberOfLines={1}
                      >
                        {device.id}
                      </Text>
                    )}
                  </View>
                  <Button
                    size="sm"
                    variant="default"
                    onPress={() => handleConnectDevice(device)}
                    disabled={isConnecting}
                    className="h-8"
                  >
                    {isConnecting ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-xs">Connect</Text>
                    )}
                  </Button>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
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
