import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useLiveMetrics } from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { MapPin } from "lucide-react-native";
import React, { memo } from "react";
import { View } from "react-native";

interface MapCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

interface LocationInfoProps {
  latitude: number;
  longitude: number;
  altitude?: number;
}

const LocationInfo = memo(
  ({ latitude, longitude, altitude }: LocationInfoProps) => (
    <View className="mt-4">
      <Text className="text-xs text-muted-foreground">
        Location: {latitude.toFixed(6)}, {longitude.toFixed(6)}
      </Text>
      {altitude !== undefined && (
        <Text className="text-xs text-muted-foreground mt-1">
          Altitude: {altitude.toFixed(0)}m
        </Text>
      )}
    </View>
  ),
);

LocationInfo.displayName = "LocationInfo";

export const MapCard = memo(({ service, screenWidth }: MapCardProps) => {
  // Get GPS coordinates from live metrics
  const metrics = useLiveMetrics(service);
  const { latitude, longitude, altitude } = metrics;

  const hasLocation = latitude !== undefined && longitude !== undefined;

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent className="p-4 flex-1">
          <View className="flex-1 items-center justify-center">
            <Icon
              as={MapPin}
              size={48}
              className="text-muted-foreground mb-4"
            />
            <Text className="text-lg font-semibold mb-2">GPS Map</Text>
            <Text className="text-sm text-muted-foreground text-center">
              {hasLocation
                ? "Map view will display your route here"
                : "Waiting for GPS signal..."}
            </Text>
            {hasLocation && (
              <LocationInfo
                latitude={latitude}
                longitude={longitude}
                altitude={altitude}
              />
            )}
          </View>
        </CardContent>
      </Card>
    </View>
  );
});

MapCard.displayName = "MapCard";
