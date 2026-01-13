import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DecompressedStream } from "@/lib/utils/streamDecompression";
import React from "react";
import { View } from "react-native";
import { ActivityRouteMap } from "./ActivityRouteMap";
import { ElevationProfileChart } from "../charts/ElevationProfileChart";

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface RouteElevationCardProps {
  coordinates: Coordinate[];
  elevationStream: DecompressedStream;
  distanceStream?: DecompressedStream;
  title?: string;
}

/**
 * Combined route map and elevation profile card
 * Displays a compact map preview above an elevation chart
 */
export function RouteElevationCard({
  coordinates,
  elevationStream,
  distanceStream,
  title = "Route & Elevation",
}: RouteElevationCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="gap-4">
        {/* Compact map preview */}
        <View className="rounded-lg overflow-hidden border border-border">
          <ActivityRouteMap
            coordinates={coordinates}
            compact={true}
            height={180}
            showMarkers={true}
            title=""
          />
        </View>

        {/* Elevation profile */}
        <View className="border-t border-border pt-4">
          <ElevationProfileChart
            elevationStream={elevationStream}
            distanceStream={distanceStream}
            title=""
            height={150}
            showStats={true}
          />
        </View>
      </CardContent>
    </Card>
  );
}
