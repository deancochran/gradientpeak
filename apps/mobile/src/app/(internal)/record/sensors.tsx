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
import { useRouter } from "expo-router";
import { Bluetooth, RefreshCw, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import type { Device } from "react-native-ble-plx";

export default function BluetoothModal() {
  const router = useRouter();

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

    setIsScanning(true);
    // Clear available devices when starting a new scan
    setAvailableDevices([]);

    try {
      await startScan();
    } catch (error) {
      console.error("Scan failed:", error);
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

    setConnectingDevices((prev) => new Set(prev).add(device.id));

    try {
      await connectDevice(device.id);
      setAvailableDevices((prev) => prev.filter((d) => d.id !== device.id));
    } catch (error) {
      console.error("Connection failed:", error);
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
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center justify-between">
        <Button size="icon" variant="ghost" onPress={() => router.back()}>
          <Icon as={X} size={24} />
        </Button>
        <Text className="text-lg font-semibold">Sensors</Text>
        <Button
          size="icon"
          variant="ghost"
          onPress={isScanning ? handleStopScan : handleStartScan}
          disabled={!bluetoothGranted}
        >
          {isScanning ? (
            <ActivityIndicator size="small" />
          ) : (
            <Icon as={RefreshCw} size={20} />
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

        {/* Connected Devices */}
        {connectedSensors.length > 0 && (
          <View className="px-4 py-4">
            <Text className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
              Connected ({connectedSensors.length})
            </Text>
            {connectedSensors.map((sensor) => (
              <View
                key={sensor.id}
                className="flex-row items-center justify-between py-3 border-b border-border"
              >
                <View className="flex-row items-center gap-3 flex-1">
                  <View className="w-2 h-2 rounded-full bg-green-500" />
                  <Text className="font-medium">{sensor.name}</Text>
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
                    <Text className="font-medium">
                      {device.name || "Unknown Device"}
                    </Text>
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
