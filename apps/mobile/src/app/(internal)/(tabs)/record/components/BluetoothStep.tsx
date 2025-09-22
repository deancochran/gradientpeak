import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { View } from "react-native";

interface BluetoothStepProps {
  onOpenBluetooth: () => void;
  onSkip: () => void;
  connectedDevices: string[];
}

export function BluetoothStep({
  onOpenBluetooth,
  onSkip,
  connectedDevices,
}: BluetoothStepProps) {
  return (
    <View className="px-6 py-4">
      <Text className="text-center text-muted-foreground mb-8">
        Connect your fitness devices for enhanced tracking
      </Text>

      {connectedDevices.length > 0 && (
        <Card className="border-success bg-success/10 mb-6">
          <CardContent className="p-4">
            <Text className="text-base font-semibold mb-2">Connected Devices</Text>
            {connectedDevices.map((device, index) => (
              <Text key={index} className="text-sm text-muted-foreground">
                • {device}
              </Text>
            ))}
          </CardContent>
        </Card>
      )}

      <View className="gap-4">
        <Button onPress={onOpenBluetooth} className="w-full">
          <Text className="font-semibold">
            {connectedDevices.length > 0 ? 'Manage Devices' : 'Connect Devices'}
          </Text>
        </Button>

        <Button onPress={onSkip} variant="outline" className="w-full">
          <Text className="text-muted-foreground">Skip for now</Text>
        </Button>
      </View>
    </View>
  );
}
