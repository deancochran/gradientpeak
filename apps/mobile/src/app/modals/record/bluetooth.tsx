import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useEnhancedActivityRecording } from "@/lib/hooks/useEnhancedActivityRecording";
import { useRouter } from "expo-router";
import { Bluetooth, ChevronLeft, RefreshCw, Zap } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";

// ===== BLUETOOTH DEVICE TYPES =====
interface BluetoothDevice {
  id: string;
  name: string;
  type: "heart_rate" | "power" | "cadence" | "speed" | "unknown";
  rssi?: number;
  isConnected?: boolean;
  isConnecting?: boolean;
  lastReading?: string;
  batteryLevel?: number;
}

export default function BluetoothModal() {
  const { connectionStatus } = useEnhancedActivityRecording();
  const router = useRouter();

  // Mock bluetooth functionality (replace with actual useAdvancedBluetooth when available)
  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<BluetoothDevice[]>(
    [],
  );
  const [availableDevices, setAvailableDevices] = useState<BluetoothDevice[]>([
    {
      id: "heart-1",
      name: "Polar H10",
      type: "heart_rate",
      rssi: -65,
      isConnected: false,
    },
    {
      id: "power-1",
      name: "Stages Power",
      type: "power",
      rssi: -58,
      isConnected: false,
    },
  ]);

  const startScan = async () => {
    setIsScanning(true);

    // Simulate scanning
    setTimeout(() => {
      setIsScanning(false);
      // Add more mock devices during scan
      setAvailableDevices((prev) => [
        ...prev,
        {
          id: "cadence-1",
          name: "Garmin Cadence",
          type: "cadence",
          rssi: -72,
          isConnected: false,
        },
      ]);
    }, 3000);
  };

  const stopScan = () => {
    setIsScanning(false);
  };

  const connectDevice = async (device: BluetoothDevice) => {
    try {
      // Update device state to connecting
      setAvailableDevices((prev) =>
        prev.map((d) =>
          d.id === device.id ? { ...d, isConnecting: true } : d,
        ),
      );

      // Simulate connection process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Move device to connected list
      const connectedDevice: BluetoothDevice = {
        ...device,
        isConnected: true,
        isConnecting: false,
        lastReading:
          device.type === "heart_rate"
            ? "142 bpm"
            : device.type === "power"
              ? "285 W"
              : device.type === "cadence"
                ? "87 rpm"
                : "Connected",
        batteryLevel: Math.floor(Math.random() * 100),
      };

      setConnectedDevices((prev) => [...prev, connectedDevice]);
      setAvailableDevices((prev) => prev.filter((d) => d.id !== device.id));

      Alert.alert("Connected", `Successfully connected to ${device.name}`);
    } catch (error) {
      console.error("Connection failed:", error);
      setAvailableDevices((prev) =>
        prev.map((d) =>
          d.id === device.id ? { ...d, isConnecting: false } : d,
        ),
      );
      Alert.alert("Connection Failed", `Could not connect to ${device.name}`);
    }
  };

  const disconnectDevice = async (deviceId: string) => {
    const device = connectedDevices.find((d) => d.id === deviceId);
    if (!device) return;

    try {
      // Move back to available devices
      setAvailableDevices((prev) => [
        ...prev,
        {
          ...device,
          isConnected: false,
          lastReading: undefined,
          batteryLevel: undefined,
        },
      ]);
      setConnectedDevices((prev) => prev.filter((d) => d.id !== deviceId));

      Alert.alert("Disconnected", `Disconnected from ${device.name}`);
    } catch (error) {
      console.error("Disconnection failed:", error);
    }
  };

  const getDeviceIcon = (type: BluetoothDevice["type"]) => {
    switch (type) {
      case "heart_rate":
        return "💓";
      case "power":
        return "⚡";
      case "cadence":
        return "🦵";
      case "speed":
        return "💨";
      default:
        return "📡";
    }
  };

  const getDeviceTypeLabel = (type: BluetoothDevice["type"]) => {
    switch (type) {
      case "heart_rate":
        return "Heart Rate Monitor";
      case "power":
        return "Power Meter";
      case "cadence":
        return "Cadence Sensor";
      case "speed":
        return "Speed/Distance Pod";
      default:
        return "Unknown Device";
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
                ? `${connectedDevices.length} device(s) connected`
                : connectionStatus.bluetooth === "connecting"
                  ? "Connecting to devices..."
                  : "No devices connected"}
            </Text>
          </View>
        </View>

        {/* Connected Devices Section */}
        {connectedDevices.length > 0 && (
          <View className="px-4 py-4">
            <Text className="text-lg font-semibold mb-3">
              Connected Devices
            </Text>
            {connectedDevices.map((device) => (
              <Card
                key={device.id}
                className="mb-3 border-green-500/20 bg-green-500/5"
              >
                <CardContent className="p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1">
                        <Text className="text-lg">
                          {getDeviceIcon(device.type)}
                        </Text>
                        <Text className="font-semibold">{device.name}</Text>
                      </View>
                      <Text className="text-sm text-muted-foreground mb-1">
                        {getDeviceTypeLabel(device.type)}
                      </Text>
                      {device.lastReading && (
                        <Text className="text-xs text-green-600 font-medium">
                          {device.lastReading}
                        </Text>
                      )}
                      {device.batteryLevel && (
                        <Text className="text-xs text-muted-foreground mt-1">
                          Battery: {device.batteryLevel}%
                        </Text>
                      )}
                    </View>
                    <View className="flex-row items-center gap-3">
                      <View className="w-3 h-3 bg-green-500 rounded-full" />
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() => disconnectDevice(device.id)}
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

          {availableDevices.length === 0 && !isScanning ? (
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
                        <Text className="text-lg">
                          {getDeviceIcon(device.type)}
                        </Text>
                        <Text className="font-semibold">
                          {device.name || "Unknown Device"}
                        </Text>
                      </View>
                      <Text className="text-sm text-muted-foreground mb-1">
                        {getDeviceTypeLabel(device.type)}
                      </Text>
                      {device.rssi && (
                        <Text className="text-xs text-muted-foreground">
                          Signal: {device.rssi}dBm
                        </Text>
                      )}
                    </View>
                    <Button
                      size="sm"
                      onPress={() => connectDevice(device)}
                      disabled={device.isConnecting}
                    >
                      {device.isConnecting ? (
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
                Heart Rate Monitors (ANT+, Bluetooth)
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
                Cadence Sensors (Cycling & Running)
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="text-base">💨</Text>
              <Text className="text-xs text-muted-foreground">
                Speed/Distance Pods (Footpod, Wheel)
              </Text>
            </View>
          </View>

          <View className="mt-4 p-3 bg-blue-50 rounded-lg">
            <View className="flex-row items-start gap-2">
              <Icon as={Zap} size={16} className="text-blue-600 mt-0.5" />
              <Text className="text-xs text-blue-700 flex-1">
                <Text className="font-semibold">Tip:</Text> Put devices in
                pairing mode before scanning. Most devices enter pairing mode
                when powered on or by holding the power button.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
