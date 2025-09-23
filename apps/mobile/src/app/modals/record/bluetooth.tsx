import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { Bluetooth, ChevronLeft, Search } from "lucide-react-native";
import { ActivityIndicator, ScrollView, View } from "react-native";
export default function BluetoothModal() {
  const { bluetoothDevices, bluetoothStatus } = useRecording();
  const {
    availableDevices,
    isScanning,
    connectDevice,
    disconnectDevice,
    startScan,
    stopScan,
  } = useBluetooth();
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" onPress={() => router.back()}>
          <ChevronLeft size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">
          Bluetooth Devices
        </Text>
        <Button
          size="icon"
          onPress={isScanning ? stopScan : startScan}
          className={isScanning ? "animate-pulse" : ""}
        >
          <Icon as={Search} size={20} />
        </Button>
      </View>

      <ScrollView className="flex-1">
        {/* Connected Devices Section */}
        {bluetoothDevices.length > 0 && (
          <View className="px-4 py-4">
            <Text className="text-lg font-semibold mb-3">
              Connected Devices
            </Text>
            {bluetoothDevices.map((device) => (
              <Card
                key={device.id}
                className="mb-3 border-green-500/20 bg-green-500/5"
              >
                <CardContent className="p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-semibold">{device.name}</Text>
                      <Text className="text-sm text-muted-foreground">
                        {device.type}
                      </Text>
                      {device.lastReading && (
                        <Text className="text-xs text-green-600 mt-1">
                          Last: {device.lastReading}
                        </Text>
                      )}
                    </View>
                    <View className="flex-row gap-2">
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

          {availableDevices.length === 0 ? (
            <Card className="border-dashed border-2 border-muted-foreground/20">
              <CardContent className="p-8 items-center">
                <Icon
                  as={Bluetooth}
                  size={48}
                  className="text-muted-foreground mb-4"
                />
                <Text className="text-center text-muted-foreground mb-2">
                  {isScanning ? "Looking for devices..." : "No devices found"}
                </Text>
                <Text className="text-center text-sm text-muted-foreground mb-4">
                  Make sure your devices are in pairing mode
                </Text>
                <Button onPress={startScan} disabled={isScanning}>
                  <Text>{isScanning ? "Scanning..." : "Start Scan"}</Text>
                </Button>
              </CardContent>
            </Card>
          ) : (
            availableDevices.map((device) => (
              <Card key={device.id} className="mb-3">
                <CardContent className="p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-semibold">
                        {device.name || "Unknown Device"}
                      </Text>
                      <Text className="text-sm text-muted-foreground">
                        {device.type}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        Signal: {device.rssi}dBm
                      </Text>
                    </View>
                    <Button
                      size="sm"
                      onPress={() => connectDevice(device)}
                      disabled={device.isConnecting}
                    >
                      <Text>
                        {device.isConnecting ? "Connecting..." : "Connect"}
                      </Text>
                    </Button>
                  </View>
                </CardContent>
              </Card>
            ))
          )}
        </View>

        {/* Device Types Guide */}
        <View className="px-4 py-4 bg-muted/50">
          <Text className="text-sm font-medium mb-2">
            Supported Device Types
          </Text>
          <View className="gap-1">
            <Text className="text-xs text-muted-foreground">
              • Heart Rate Monitors
            </Text>
            <Text className="text-xs text-muted-foreground">
              • Power Meters
            </Text>
            <Text className="text-xs text-muted-foreground">
              • Cadence Sensors
            </Text>
            <Text className="text-xs text-muted-foreground">
              • Speed/Distance Pods
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
