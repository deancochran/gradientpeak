import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useEnhancedActivityRecording } from "@/lib/hooks/useEnhancedActivityRecording";
import { useRouter } from "expo-router";
import { Bluetooth, ChevronLeft, RefreshCw, Zap } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import type { Device } from "react-native-ble-plx";

export default function BluetoothModal() {
  const {
    connectionStatus,
    connectedSensors,
    permissions,
    scanForDevices,
    connectToDevice,
    disconnectDevice,
    requestPermission,
  } = useEnhancedActivityRecording();

  const router = useRouter();

  // Local state for scanning
  const [isScanning, setIsScanning] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [connectingDevices, setConnectingDevices] = useState<Set<string>>(
    new Set(),
  );

  /** Start scanning for BLE devices */
  const startScan = async () => {
    // Check Bluetooth permission first
    if (!permissions.bluetooth?.granted) {
      const granted = await requestPermission("bluetooth");
      if (!granted) {
        Alert.alert(
          "Bluetooth Permission Required",
          "Please grant Bluetooth permission to scan for devices.",
        );
        return;
      }
    }

    setIsScanning(true);
    setAvailableDevices([]);

    try {
      const devices = await scanForDevices();
      setAvailableDevices(
        devices.filter(
          (device) =>
            // Filter out already connected devices
            !connectedSensors.some((sensor) => sensor.id === device.id),
        ),
      );
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

  /** Stop scanning */
  const stopScan = () => {
    setIsScanning(false);
  };

  /** Connect to a device */
  const handleConnectDevice = async (device: Device) => {
    if (connectingDevices.has(device.id)) return;

    setConnectingDevices((prev) => new Set(prev).add(device.id));

    try {
      const sensor = await connectToDevice(device.id);
      if (sensor) {
        // Remove from available devices
        setAvailableDevices((prev) => prev.filter((d) => d.id !== device.id));
        Alert.alert(
          "Connected",
          `Successfully connected to ${device.name || "Unknown Device"}`,
        );
      } else {
        Alert.alert(
          "Connection Failed",
          `Could not connect to ${device.name || "Unknown Device"}`,
        );
      }
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

  /** Get device type icon from services */
  const getDeviceIcon = (services: string[]): string => {
    // Check for known fitness device services
    const serviceMap: Record<string, string> = {
      "0000180d": "💓", // Heart Rate Service
      "00001818": "⚡", // Cycling Power Service
      "00001816": "🦵", // Cycling Speed and Cadence Service
      "0000180a": "🔋", // Device Information Service
    };

    for (const service of services) {
      const normalizedService = service.toLowerCase().replace(/-/g, "");
      if (serviceMap[normalizedService]) {
        return serviceMap[normalizedService];
      }
    }
    return "📡"; // Generic sensor icon
  };

  /** Get device type label from services */
  const getDeviceTypeLabel = (services: string[]): string => {
    const labels: string[] = [];

    services.forEach((service) => {
      const normalizedService = service.toLowerCase().replace(/-/g, "");
      switch (normalizedService) {
        case "0000180d":
          labels.push("Heart Rate");
          break;
        case "00001818":
          labels.push("Power Meter");
          break;
        case "00001816":
          labels.push("Speed/Cadence");
          break;
      }
    });

    return labels.length > 0 ? labels.join(", ") : "Unknown Device";
  };

  /** Check for device data from service */
  const getDeviceReading = (deviceId: string): string | undefined => {
    // This would need to be implemented in the service to track live readings
    // For now, just show connected status
    return "Connected";
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
          onPress={isScanning ? stopScan : startScan}
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
              <Button
                size="sm"
                variant="outline"
                onPress={() => requestPermission("bluetooth")}
              >
                <Text className="text-xs">Grant</Text>
              </Button>
            </View>
          </View>
        )}

        {/* Connection Status Banner */}
        <View className="px-4 py-3 bg-muted/50">
          <View className="flex-row items-center gap-2">
            <Icon
              as={Bluetooth}
              size={16}
              className={
                connectionStatus.bluetooth === "connected"
                  ? "text-blue-500"
                  : "text-muted-foreground"
              }
            />
            <Text className="text-sm">
              {connectionStatus.bluetooth === "connected"
                ? `${connectedSensors.length} device(s) connected`
                : connectionStatus.bluetooth === "connecting"
                  ? "Connecting to devices..."
                  : "No devices connected"}
            </Text>
          </View>
        </View>

        {/* Connected Devices Section */}
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
                      <View className="flex-row items-center gap-2 mb-1">
                        <Text className="text-lg">
                          {getDeviceIcon(sensor.services)}
                        </Text>
                        <Text className="font-semibold">{sensor.name}</Text>
                      </View>
                      <Text className="text-sm text-muted-foreground mb-1">
                        {getDeviceTypeLabel(sensor.services)}
                      </Text>
                      <Text className="text-xs text-green-600 font-medium">
                        {getDeviceReading(sensor.id) || "Connected"}
                      </Text>
                      <Text className="text-xs text-muted-foreground mt-1">
                        Connected:{" "}
                        {new Date(sensor.connectionTime).toLocaleTimeString()}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-3">
                      <View className="w-3 h-3 bg-green-500 rounded-full" />
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() => handleDisconnectDevice(sensor.id)}
                      >
                        <Text>Disconnect</Text>
                      </Button>
                    </View>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        )}

        {/* Available Devices Section */}
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

          {!permissions.bluetooth?.granted ? (
            <Card className="border-dashed border-2 border-orange-500/20">
              <CardContent className="p-8 items-center">
                <Icon
                  as={Bluetooth}
                  size={48}
                  className="text-orange-500 mb-4"
                />
                <Text className="text-center text-orange-700 mb-2 font-medium">
                  Bluetooth Permission Required
                </Text>
                <Text className="text-center text-sm text-orange-600 mb-4">
                  Grant Bluetooth permission to scan for and connect to fitness
                  devices
                </Text>
                <Button
                  onPress={() => requestPermission("bluetooth")}
                  variant="outline"
                >
                  <Text>Grant Permission</Text>
                </Button>
              </CardContent>
            </Card>
          ) : availableDevices.length === 0 && !isScanning ? (
            <Card className="border-dashed border-2 border-muted-foreground/20">
              <CardContent className="p-8 items-center">
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
              </CardContent>
            </Card>
          ) : (
            availableDevices.map((device) => (
              <Card key={device.id} className="mb-3">
                <CardContent className="p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1">
                        <Text className="text-lg">📡</Text>
                        <Text className="font-semibold">
                          {device.name || "Unknown Device"}
                        </Text>
                      </View>
                      <Text className="text-sm text-muted-foreground mb-1">
                        Bluetooth Device
                      </Text>
                      {device.rssi && (
                        <Text className="text-xs text-muted-foreground">
                          Signal: {device.rssi}dBm
                        </Text>
                      )}
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
            ))
          )}

          {/* Scanning placeholder */}
          {isScanning && availableDevices.length === 0 && (
            <Card className="border-dashed border-2 border-blue-500/20">
              <CardContent className="p-8 items-center">
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text className="text-center text-muted-foreground mt-4 font-medium">
                  Scanning for devices...
                </Text>
                <Text className="text-center text-sm text-muted-foreground mt-2">
                  Make sure your devices are powered on and in pairing mode
                </Text>
              </CardContent>
            </Card>
          )}
        </View>

        {/* Device Guide */}
        <View className="px-4 py-4 bg-muted/50">
          <Text className="text-sm font-medium mb-3">
            Supported Device Types
          </Text>
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <Text className="text-base">💓</Text>
              <Text className="text-xs text-muted-foreground">
                Heart Rate Monitors (Bluetooth Low Energy)
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="text-base">⚡</Text>
              <Text className="text-xs text-muted-foreground">
                Power Meters (Cycling & Running)
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="text-base">🦵</Text>
              <Text className="text-xs text-muted-foreground">
                Speed & Cadence Sensors
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="text-base">📡</Text>
              <Text className="text-xs text-muted-foreground">
                Any Bluetooth LE fitness device
              </Text>
            </View>
          </View>

          <View className="mt-4 p-3 bg-blue-50 rounded-lg">
            <View className="flex-row items-start gap-2">
              <Icon as={Zap} size={16} className="text-blue-600 mt-0.5" />
              <Text className="text-xs text-blue-700 flex-1">
                <Text className="font-semibold">Tip:</Text> Put devices in
                pairing mode before scanning. Most devices enter pairing mode
                when powered on or by holding the power button for a few
                seconds.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
