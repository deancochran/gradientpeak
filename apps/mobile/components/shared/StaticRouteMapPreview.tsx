import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, Region } from "react-native-maps";

type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

type StaticRouteMapPreviewProps = {
  coordinates: RouteCoordinate[];
  height?: number;
  showMarkers?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  testID?: string;
};

const MIN_DELTA = 0.005;
const DEFAULT_HEIGHT = 160;
const DEFAULT_ASPECT_RATIO = 1.8;
const PADDING_RATIO = 0.12;

function getRegionForCoordinates(
  coordinates: RouteCoordinate[],
  width: number,
  height: number,
): Region | null {
  if (coordinates.length === 0) {
    return null;
  }

  let minLatitude = coordinates[0]!.latitude;
  let maxLatitude = coordinates[0]!.latitude;
  let minLongitude = coordinates[0]!.longitude;
  let maxLongitude = coordinates[0]!.longitude;

  for (const coordinate of coordinates) {
    minLatitude = Math.min(minLatitude, coordinate.latitude);
    maxLatitude = Math.max(maxLatitude, coordinate.latitude);
    minLongitude = Math.min(minLongitude, coordinate.longitude);
    maxLongitude = Math.max(maxLongitude, coordinate.longitude);
  }

  const centerLatitude = (minLatitude + maxLatitude) / 2;
  const centerLongitude = (minLongitude + maxLongitude) / 2;
  const latitudeSpan = Math.max(maxLatitude - minLatitude, MIN_DELTA / 2);
  const longitudeSpan = Math.max(maxLongitude - minLongitude, MIN_DELTA / 2);
  const paddedLatitudeSpan = Math.max(latitudeSpan * (1 + PADDING_RATIO * 2), MIN_DELTA);
  const paddedLongitudeSpan = Math.max(longitudeSpan * (1 + PADDING_RATIO * 2), MIN_DELTA);
  const aspectRatio = width > 0 && height > 0 ? width / height : DEFAULT_ASPECT_RATIO;
  const longitudeScale = Math.max(Math.cos((centerLatitude * Math.PI) / 180), 0.2);
  const adjustedLongitudeSpan = paddedLongitudeSpan * longitudeScale;

  let latitudeDelta = paddedLatitudeSpan;
  let longitudeDelta = paddedLongitudeSpan;

  if (adjustedLongitudeSpan / paddedLatitudeSpan > aspectRatio) {
    latitudeDelta = Math.max(adjustedLongitudeSpan / aspectRatio, MIN_DELTA);
  } else {
    longitudeDelta = Math.max((paddedLatitudeSpan * aspectRatio) / longitudeScale, MIN_DELTA);
  }

  return {
    latitude: centerLatitude,
    longitude: centerLongitude,
    latitudeDelta,
    longitudeDelta,
  };
}

export function StaticRouteMapPreview({
  coordinates,
  height,
  showMarkers = false,
  strokeColor = "#3b82f6",
  strokeWidth = 4,
  testID,
}: StaticRouteMapPreviewProps) {
  const [layoutWidth, setLayoutWidth] = useState(0);

  const region = useMemo(
    () => getRegionForCoordinates(coordinates, layoutWidth, height ?? DEFAULT_HEIGHT),
    [coordinates, height, layoutWidth],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0 && nextWidth !== layoutWidth) {
      setLayoutWidth(nextWidth);
    }
  };

  if (coordinates.length === 0 || !region) {
    return null;
  }

  const startCoordinate = coordinates[0]!;
  const endCoordinate = coordinates[coordinates.length - 1]!;

  return (
    <View style={height != null ? { height } : { flex: 1 }} onLayout={handleLayout} testID={testID}>
      <MapView
        style={{ flex: 1 }}
        provider={PROVIDER_DEFAULT}
        region={region}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        toolbarEnabled={false}
      >
        <Polyline
          coordinates={coordinates}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          lineCap="round"
          lineJoin="round"
        />
        {showMarkers ? (
          <Marker coordinate={startCoordinate} anchor={{ x: 0.5, y: 0.5 }} title="Start">
            <View className="h-3 w-3 rounded-full border-2 border-white bg-green-500" />
          </Marker>
        ) : null}
        {showMarkers ? (
          <Marker coordinate={endCoordinate} anchor={{ x: 0.5, y: 0.5 }} title="Finish">
            <View className="h-3 w-3 rounded-full border-2 border-white bg-red-500" />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}
