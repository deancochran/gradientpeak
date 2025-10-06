import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  usePermissions,
  useRecorderActions,
  useSensors,
} from "@/lib/hooks/useActivityRecorder";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { useRouter } from "expo-router";
import { Bluetooth, ChevronLeft, RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import type { Device } from "react-native-ble-plx";

export default function BluetoothModal() {
  const router = useRouter();

  // Use shared service from context (provided by _layout.tsx)
  const service = useSharedActivityRecorder();
  const permissions = usePermissions(service);
  const { sensors: connectedSensors } = useSensors(service);
  const { scanDevices, connectDevice, disconnectDevice } =
    useRecorderActions(service);

  // Local state for scanning
  const [isScanning, setIsScanning] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [connectingDevices, setConnectingDevices] = useState<Set<string>>(
    new Set(),
  );

  /** Start scanning for BLE devices */
  const startScan = async () => {
    if (!permissions.bluetooth?.granted) {
      Alert.alert(
        "Bluetooth Permission Required",
        "Please grant Bluetooth permission to scan for devices.",
      );
      return;
    }

    setIsScanning(true);
    setAvailableDevices([]);

    try {
      const devices = await scanDevices();

      // Filter out already connected devices
      const filteredDevices = devices.filter(
        (device) => !connectedSensors.some((sensor) => sensor.id === device.id),
      );
      setAvailableDevices(filteredDevices);
    } catch (error) {
      console.error("Scan failed:", error);
      Alert.alert(
        "Scan Failed",
        "Could not scan for devices. Please try again.",
      );
    } finally {
      setIsScanning(false);
    }
  };

  /** Connect to a device */
  const handleConnectDevice = async (device: Device) => {
    if (connectingDevices.has(device.id)) return;

    setConnectingDevices((prev) => new Set(prev).add(device.id));

    try {
      await connectDevice(device.id);
      setAvailableDevices((prev) => prev.filter((d) => d.id !== device.id));
      Alert.alert(
        "Connected",
        `Successfully connected to ${device.name || "Unknown Device"}`,
      );
    } catch (error) {
      console.error("Connection failed:", error);
      Alert.alert(
        "Connection Failed",
        `Could not connect to ${device.name || "Unknown Device"}`,
      );
    } finally {
      setConnectingDevices((prev) => {
        const newSet = new Set(prev);
        newSet.delete(device.id);
        return newSet;
      });
    }
  };

  /** Disconnect from a device */
  const handleDisconnectDevice = async (deviceId: string) => {
    const sensor = connectedSensors.find((s) => s.id === deviceId);
    if (!sensor) return;

    try {
      await disconnectDevice(deviceId);
      Alert.alert("Disconnected", `Disconnected from ${sensor.name}`);
    } catch (error) {
      console.error("Disconnection failed:", error);
      Alert.alert(
        "Disconnection Failed",
        `Could not disconnect from ${sensor.name}`,
      );
    }
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" variant="ghost" onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">
          Bluetooth Devices
        </Text>
        <Button
          size="icon"
          variant="ghost"
          onPress={isScanning ? () => setIsScanning(false) : startScan}
          disabled={isScanning}
        >
          <Icon
            as={RefreshCw}
            size={20}
            className={isScanning ? "animate-spin" : ""}
          />
        </Button>
      </View>

      <ScrollView className="flex-1">
        {/* Permission Status */}
        {!permissions.bluetooth?.granted && (
          <View className="px-4 py-3 bg-orange-500/10 border-b border-orange-500/20">
            <View className="flex-row items-center gap-2">
              <Icon as={Bluetooth} size={16} className="text-orange-500" />
              <Text className="text-sm text-orange-700 flex-1">
                Bluetooth permission required to scan for devices
              </Text>
            </View>
          </View>
        )}

        {/* Connection Status Banner */}
        <View className="px-4 py-3 bg-muted/50">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm">
              {`${connectedSensors.length} device(s) connected`}
            </Text>
          </View>
        </View>

        {/* Connected Devices */}
        {connectedSensors.length > 0 && (
          <View className="px-4 py-4">
            <Text className="text-lg font-semibold mb-3">
              Connected Devices ({connectedSensors.length})
            </Text>
            {connectedSensors.map((sensor) => (
              <Card
                key={sensor.id}
                className="mb-3 border-green-500/20 bg-green-500/5"
              >
                <CardContent className="p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-semibold">{sensor.name}</Text>
                      <Text className="text-xs text-green-600 font-medium">
                        Connected
                      </Text>
                    </View>
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => handleDisconnectDevice(sensor.id)}
                    >
                      Disconnect
                    </Button>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        )}

        {/* Available Devices */}
        <View className="px-4 py-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-semibold">Available Devices</Text>
            {isScanning && (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" />
                <Text className="text-sm text-muted-foreground">
                  Scanning...
                </Text>
              </View>
            )}
          </View>

          {availableDevices.length === 0 && !isScanning ? (
            <Card className="border-dashed border-2 border-muted-foreground/20 p-8 items-center">
              <Icon
                as={Bluetooth}
                size={48}
                className="text-muted-foreground mb-4"
              />
              <Text className="text-center text-muted-foreground mb-2 font-medium">
                No devices found
              </Text>
              <Text className="text-center text-sm text-muted-foreground mb-4">
                Make sure your devices are in pairing mode and nearby
              </Text>
              <Button onPress={startScan} variant="outline">
                <Icon as={RefreshCw} size={16} />
                <Text className="ml-2">Start Scan</Text>
              </Button>
            </Card>
          ) : (
            availableDevices.map((device) => {
              return (
                <Card key={device.id} className="mb-3">
                  <CardContent className="p-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 mb-1">
                          <Text className="font-semibold">
                            {device.name || "Unknown Device"}
                          </Text>
                        </View>
                      </View>
                      <Button
                        size="sm"
                        onPress={() => handleConnectDevice(device)}
                        disabled={connectingDevices.has(device.id)}
                      >
                        {connectingDevices.has(device.id) ? (
                          <View className="flex-row items-center gap-2">
                            <ActivityIndicator size="small" />
                            <Text>Connecting...</Text>
                          </View>
                        ) : (
                          <Text>Connect</Text>
                        )}
                      </Button>
                    </View>
                  </CardContent>
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
