import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { MapPin, Upload, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { ResourcePickerModal } from "@/components/shared/resource-picker";
import { StaticRouteMapPreview } from "@/components/shared/StaticRouteMapPreview";

type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

type ActivityPlanRouteSectionProps = {
  coordinates: RouteCoordinate[] | null;
  error?: string;
  isUploadingRoute: boolean;
  onClearRoute: () => void;
  onPickRoute: () => void;
  onSelectRoute: (routeId: string) => void;
  route: any;
  routeId: string | null;
};

export function ActivityPlanRouteSection({
  coordinates,
  error,
  isUploadingRoute,
  onClearRoute,
  onPickRoute,
  onSelectRoute,
  route,
  routeId,
}: ActivityPlanRouteSectionProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const handleUploadRoute = () => {
    setIsPickerOpen(false);
    onPickRoute();
  };

  return (
    <Card>
      <CardContent className="gap-2 p-3">
        {!routeId ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-11 flex-row items-center justify-between rounded-lg border border-dashed border-border px-3 py-2"
            disabled={isUploadingRoute}
            onPress={() => setIsPickerOpen(true)}
          >
            <View className="flex-row items-center gap-2">
              <Icon as={MapPin} size={16} className="text-muted-foreground" />
              <Text className="text-sm font-medium text-foreground">
                {isUploadingRoute ? "Uploading route..." : "Attach route"}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground">Public, shared, or private</Text>
          </Pressable>
        ) : route ? (
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-lg border border-border p-2"
            onPress={() => setIsPickerOpen(true)}
          >
            {coordinates && coordinates.length > 0 ? (
              <View className="h-14 w-20 overflow-hidden rounded-md">
                <StaticRouteMapPreview
                  coordinates={coordinates}
                  strokeColor="#3b82f6"
                  strokeWidth={3}
                />
              </View>
            ) : null}
            <View className="flex-1">
              <Text className="font-medium text-foreground" numberOfLines={1}>
                {route.name}
              </Text>
              <View className="mt-1 flex-row items-center gap-1">
                <Icon as={MapPin} size={12} className="text-muted-foreground" />
                <Text className="text-xs text-muted-foreground">
                  {((route.total_distance ?? 0) / 1000).toFixed(1)} km route context
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Remove route"
              accessibilityRole="button"
              className="min-h-11 min-w-11 items-center justify-center rounded-full bg-muted"
              disabled={isUploadingRoute}
              onPress={onClearRoute}
            >
              <Icon as={X} size={16} className="text-muted-foreground" />
            </Pressable>
          </Pressable>
        ) : (
          <View className="min-h-11 justify-center rounded-lg border border-border px-3 py-2">
            <Text className="text-xs text-muted-foreground">Loading route...</Text>
          </View>
        )}

        {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
      </CardContent>

      {isPickerOpen ? (
        <ResourcePickerModal
          visible={isPickerOpen}
          scope="routes"
          selectedId={routeId}
          title="Attach Route"
          description="Choose an accessible route, or upload a GPX file and attach it directly."
          onClose={() => setIsPickerOpen(false)}
          onSelect={(item) => {
            onSelectRoute(item.id);
            setIsPickerOpen(false);
          }}
          footerAction={
            <Pressable
              accessibilityRole="button"
              className="min-h-11 flex-row items-center justify-center gap-2 rounded-md border border-border px-3 py-2"
              disabled={isUploadingRoute}
              onPress={handleUploadRoute}
            >
              <Icon as={Upload} size={16} className="text-foreground" />
              <Text className="text-sm font-semibold text-foreground">
                {isUploadingRoute ? "Uploading route..." : "Upload New GPX Route"}
              </Text>
            </Pressable>
          }
        />
      ) : null}
    </Card>
  );
}
