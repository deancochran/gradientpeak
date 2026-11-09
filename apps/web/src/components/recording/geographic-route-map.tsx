import { Button } from "@repo/ui/components/button";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { STREET_MAP_PROVIDER } from "../../lib/street-map-provider";

export type GeographicCoordinate = { latitude: number; longitude: number };
export type GeographicRouteMapProps = {
  coordinates: readonly GeographicCoordinate[];
  currentPosition?: GeographicCoordinate | null;
  currentPositionLabel?: string;
  fallback: ReactNode;
  routeKey?: string;
};

const MAX_WEB_MERCATOR_LATITUDE = 85.05112878;

export function normalizeGeographicCoordinates(coordinates: readonly GeographicCoordinate[]) {
  const valid: GeographicCoordinate[] = [];
  let clampedPole = false;
  let previousLongitude: number | null = null;
  for (const point of coordinates) {
    if (
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      Math.abs(point.latitude) > 90 ||
      Math.abs(point.longitude) > 180
    )
      continue;
    const latitude = Math.max(
      -MAX_WEB_MERCATOR_LATITUDE,
      Math.min(MAX_WEB_MERCATOR_LATITUDE, point.latitude),
    );
    clampedPole ||= latitude !== point.latitude;
    let longitude = point.longitude;
    if (previousLongitude !== null) {
      while (longitude - previousLongitude > 180) longitude -= 360;
      while (longitude - previousLongitude < -180) longitude += 360;
    }
    previousLongitude = longitude;
    valid.push({ latitude, longitude });
  }
  return { coordinates: valid, clampedPole };
}

export function normalizeDisplayedPosition(
  position: GeographicCoordinate | null | undefined,
  route: readonly GeographicCoordinate[],
) {
  if (
    !position ||
    !Number.isFinite(position.latitude) ||
    !Number.isFinite(position.longitude) ||
    Math.abs(position.latitude) > 90 ||
    Math.abs(position.longitude) > 180
  )
    return null;
  const referenceLongitude = route[0]?.longitude;
  const longitude =
    referenceLongitude === undefined
      ? position.longitude
      : position.longitude + 360 * Math.round((referenceLongitude - position.longitude) / 360);
  return {
    latitude: Math.max(
      -MAX_WEB_MERCATOR_LATITUDE,
      Math.min(MAX_WEB_MERCATOR_LATITUDE, position.latitude),
    ),
    longitude,
  };
}

/**
 * Client-only, explicitly opt-in street context. Until the user opts in this
 * renders only the supplied schematic, imports no map code, and issues no tile
 * requests. Consent is intentionally local to this mounted view.
 */
export function GeographicRouteMap({
  coordinates,
  currentPosition = null,
  currentPositionLabel,
  fallback,
  routeKey,
}: GeographicRouteMapProps) {
  const [streetMap, setStreetMap] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const { coordinates: route, clampedPole } = useMemo(
    () => normalizeGeographicCoordinates(coordinates),
    [coordinates],
  );
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const generationRef = useRef(0);
  const routeRef = useRef(route);
  routeRef.current = route;
  const currentPositionRef = useRef(currentPosition);
  currentPositionRef.current = currentPosition;
  const routeIdentity = `${routeKey ?? "route"}:${route.map((point) => `${point.latitude},${point.longitude}`).join(";")}`;
  const previousRoute = useRef<string | null>(null);
  const labelId = useId();

  useEffect(() => {
    const currentRoute = routeRef.current;
    if (!streetMap || currentRoute.length < 2 || mapError || !mapElement.current) return;
    let disposed = false;
    const generation = ++generationRef.current;
    const isCurrent = () => !disposed && generationRef.current === generation;
    const disposeMap = () => {
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    void Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")])
      .then(([leaflet]) => {
        if (!isCurrent() || !mapElement.current) return;
        leafletRef.current = leaflet;
        const map = leaflet.map(mapElement.current, {
          attributionControl: true,
          zoomControl: false,
        });
        mapRef.current = map;
        const tileLayer = leaflet
          .tileLayer(STREET_MAP_PROVIDER.tileUrl, {
            attribution: STREET_MAP_PROVIDER.attribution,
            referrerPolicy: "origin",
            maxZoom: 19,
          })
          .addTo(map);
        const failMap = () => {
          if (!isCurrent()) return;
          disposeMap();
          setMapError("Street imagery could not load. The route schematic remains available.");
        };
        tileLayer.on("tileerror", failMap);
        const latLngs = currentRoute.map(
          (point) => [point.latitude, point.longitude] as [number, number],
        );
        leaflet.polyline(latLngs, { color: "#2563eb", weight: 5, lineCap: "round" }).addTo(map);
        leaflet
          .circleMarker(latLngs[0] as [number, number], {
            color: "#047857",
            fillOpacity: 1,
            radius: 6,
          })
          .addTo(map);
        leaflet
          .circleMarker(latLngs[latLngs.length - 1] as [number, number], {
            color: "#e11d48",
            fillOpacity: 1,
            radius: 6,
          })
          .addTo(map);
        const markerPosition = normalizeDisplayedPosition(currentPositionRef.current, currentRoute);
        if (markerPosition) {
          markerRef.current = leaflet
            .circleMarker([markerPosition.latitude, markerPosition.longitude], {
              color: "#7c3aed",
              fillOpacity: 1,
              radius: 7,
            })
            .addTo(map);
        }
        map.fitBounds(leaflet.latLngBounds(latLngs), { padding: [18, 18], maxZoom: 16 });
        previousRoute.current = routeIdentity;
      })
      .catch(() => {
        if (!isCurrent()) return;
        disposeMap();
        setMapError("Street map could not load. The route schematic remains available.");
      });
    return () => {
      disposed = true;
      generationRef.current += 1;
      disposeMap();
    };
  }, [mapError, routeIdentity, streetMap]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map) return;
    if (previousRoute.current !== routeIdentity) {
      const latLngs = route.map((point) => [point.latitude, point.longitude] as [number, number]);
      map.fitBounds(leaflet.latLngBounds(latLngs), { padding: [18, 18], maxZoom: 16 });
      previousRoute.current = routeIdentity;
    }
  }, [route, routeIdentity]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    if (!leaflet || !mapRef.current) return;
    const displayedPosition = normalizeDisplayedPosition(currentPosition, route);
    if (!displayedPosition) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = leaflet
        .circleMarker([displayedPosition.latitude, displayedPosition.longitude], {
          color: "#7c3aed",
          fillOpacity: 1,
          radius: 7,
        })
        .addTo(mapRef.current);
    } else markerRef.current.setLatLng([displayedPosition.latitude, displayedPosition.longitude]);
  }, [currentPosition, route]);

  const resetView = () => {
    const leaflet = leafletRef.current;
    if (!leaflet || !mapRef.current || route.length < 2) return;
    mapRef.current.fitBounds(
      leaflet.latLngBounds(route.map((point) => [point.latitude, point.longitude])),
      {
        padding: [18, 18],
        maxZoom: 16,
      },
    );
  };
  const hideStreetMap = () => {
    generationRef.current += 1;
    markerRef.current = null;
    mapRef.current?.remove();
    mapRef.current = null;
    setMapError(null);
    setStreetMap(false);
  };

  if (!streetMap || route.length < 2 || mapError) {
    return (
      <div className="space-y-2">
        {fallback}
        {route.length >= 2 ? <StreetMapDisclosure /> : null}
        {route.length >= 2 ? (
          <Button type="button" variant="outline" onClick={() => setStreetMap(true)}>
            Load street map
          </Button>
        ) : null}
        {mapError ? (
          <p role="status" className="text-sm text-muted-foreground">
            {mapError}
          </p>
        ) : null}
        {mapError ? (
          <Button type="button" variant="outline" onClick={() => setMapError(null)}>
            Retry street map
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <figure className="space-y-2">
      <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">Street map controls</legend>
        <Button type="button" size="sm" variant="outline" onClick={() => mapRef.current?.zoomIn()}>
          Zoom in
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => mapRef.current?.zoomOut()}>
          Zoom out
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={resetView}>
          Reset route view
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={hideStreetMap}>
          Hide street map
        </Button>
      </fieldset>
      <div
        aria-describedby={labelId}
        aria-label="Street map route context"
        className="h-60 w-full rounded-xl border border-border sm:h-80"
        ref={mapElement}
        role="application"
      />
      <figcaption id={labelId} className="text-xs text-muted-foreground">
        <StreetMapDisclosure /> Best-effort map context only; the route schematic remains available
        if imagery fails.
        {currentPositionLabel ? ` ${currentPositionLabel}` : ""}
        {clampedPole ? " Near-polar points are clamped for Web Mercator display." : ""}
      </figcaption>
    </figure>
  );
}

function StreetMapDisclosure() {
  return (
    <span className="text-xs text-muted-foreground">
      {STREET_MAP_PROVIDER.name} loads only the viewed area after your choice. Tile requests reveal
      your viewed area and IP address to OpenStreetMap; browser caching is used. ©{" "}
      <a className="underline" href="https://www.openstreetmap.org/copyright">
        OpenStreetMap contributors
      </a>{" "}
      ·{" "}
      <a className="underline" href="https://www.openstreetmap.org/fixthemap">
        Report a map issue
      </a>
      .
    </span>
  );
}
