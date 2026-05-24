export type RecordingRouteAttachmentSource = "none" | "plan_route" | "explicit_route";

export interface RecordingRouteAttachmentView {
  routeId: string | null;
  source: RecordingRouteAttachmentSource;
  suppressedPlanRouteId: string | null;
}

export type LoadedRoute = {
  id: string;
  name: string;
  coordinates: Array<{
    latitude: number;
    longitude: number;
    altitude?: number;
    elevation?: number;
  }>;
  polyline?: string | null;
  elevation_profile?: Array<{
    distance: number;
    elevation: number;
  }>;
  distanceIndex?: {
    segmentDistances: number[];
    cumulativeDistances: number[];
  };
};

type RouteProjection = {
  distanceAlongRoute: number;
  distanceFromRoute: number;
  segmentIndex: number;
};

type RouteControllerSnapshot = {
  routeOverrideId: string | null | undefined;
  suppressedPlanRouteId: string | null;
  currentRoute: LoadedRoute | null;
  routeDistance: number;
  currentRouteDistance: number;
};

export class RouteController {
  private currentRouteValue: LoadedRoute | null = null;
  private routeOverrideId: string | null | undefined = undefined;
  private suppressedPlanRouteId: string | null = null;
  private routeDistanceValue = 0;
  private currentRouteDistanceValue = 0;
  private isOnRouteValue = false;
  private distanceFromRouteMetersValue: number | null = null;
  private operationId = 0;
  private gradeSegmentIndex = 0;
  private projectionSegmentIndex = 0;
  private projectionUpdateCount = 0;

  get hasRoute(): boolean {
    return this.currentRouteValue !== null;
  }

  get currentRoute(): LoadedRoute | null {
    return this.currentRouteValue;
  }

  get routeDistance(): number {
    return this.routeDistanceValue;
  }

  get currentRouteDistance(): number {
    return this.currentRouteDistanceValue;
  }

  get distanceFromRouteMeters(): number | null {
    return this.distanceFromRouteMetersValue;
  }

  get routeProgress(): number {
    if (!this.hasRoute || this.routeDistanceValue === 0) return 0;
    return (this.currentRouteDistanceValue / this.routeDistanceValue) * 100;
  }

  get currentRouteGrade(): number {
    if (!this.hasRoute || !this.currentRouteValue?.elevation_profile) return 0;

    const profile = this.currentRouteValue.elevation_profile;
    if (!profile || profile.length < 2) return 0;

    const maxSegmentIndex = Math.max(0, profile.length - 2);
    let segmentIndex = Math.min(this.gradeSegmentIndex, maxSegmentIndex);

    while (
      segmentIndex < maxSegmentIndex &&
      this.currentRouteDistanceValue >= profile[segmentIndex + 1]?.distance
    ) {
      segmentIndex += 1;
    }

    while (segmentIndex > 0 && this.currentRouteDistanceValue < profile[segmentIndex]?.distance) {
      segmentIndex -= 1;
    }

    this.gradeSegmentIndex = segmentIndex;

    const current = profile[segmentIndex];
    const next = profile[Math.min(segmentIndex + 1, profile.length - 1)];
    const elevationChange = next.elevation - current.elevation;
    const distanceChange = next.distance - current.distance;

    if (distanceChange === 0) return 0;

    return (elevationChange / distanceChange) * 100;
  }

  isOnRoute(gpsRecordingEnabled: boolean): boolean {
    return !gpsRecordingEnabled || this.isOnRouteValue;
  }

  hasCurrentRouteGeometry(): boolean {
    return Boolean(this.currentRouteValue?.coordinates?.length);
  }

  getAttachedRouteId(planRouteId: string | null | undefined): string | null {
    return this.getRouteAttachment(planRouteId).routeId;
  }

  getRouteAttachment(planRouteId: string | null | undefined): RecordingRouteAttachmentView {
    if (this.routeOverrideId) {
      return {
        routeId: this.routeOverrideId,
        source: "explicit_route",
        suppressedPlanRouteId: this.suppressedPlanRouteId,
      };
    }

    if (planRouteId && this.routeOverrideId === undefined) {
      return {
        routeId: planRouteId,
        source: "plan_route",
        suppressedPlanRouteId: null,
      };
    }

    return {
      routeId: null,
      source: "none",
      suppressedPlanRouteId: this.suppressedPlanRouteId,
    };
  }

  beginPlanRouteAttachment(): number {
    this.routeOverrideId = undefined;
    this.suppressedPlanRouteId = null;
    return this.beginOperation();
  }

  clearPlanAttachment(): void {
    this.routeOverrideId = undefined;
    this.suppressedPlanRouteId = null;
    this.beginOperation();
  }

  beginExplicitRouteAttachment(routeId: string): {
    operationId: number;
    snapshot: RouteControllerSnapshot;
  } {
    const snapshot = this.createSnapshot();
    const operationId = this.beginOperation();
    this.routeOverrideId = routeId;
    this.suppressedPlanRouteId = null;
    return { operationId, snapshot };
  }

  prepareExplicitRouteAttachment(routeId: string): number {
    const operationId = this.beginOperation();
    this.routeOverrideId = routeId;
    this.suppressedPlanRouteId = null;
    return operationId;
  }

  detachRoute(planRouteId: string | null | undefined): void {
    this.beginOperation();
    this.suppressedPlanRouteId =
      this.getRouteAttachment(planRouteId).source === "plan_route" ? (planRouteId ?? null) : null;
    this.routeOverrideId = null;
  }

  isCurrentOperation(operationId: number): boolean {
    return operationId === this.operationId;
  }

  rollback(snapshot: RouteControllerSnapshot): void {
    this.routeOverrideId = snapshot.routeOverrideId;
    this.suppressedPlanRouteId = snapshot.suppressedPlanRouteId;
    this.currentRouteValue = snapshot.currentRoute;
    this.routeDistanceValue = snapshot.routeDistance;
    this.currentRouteDistanceValue = snapshot.currentRouteDistance;
  }

  loadRoute(route: LoadedRoute, operationId: number): boolean {
    if (!this.isCurrentOperation(operationId)) {
      return false;
    }

    const normalizedRoute = this.normalizeLoadedRoute(route);
    this.currentRouteValue = normalizedRoute;
    this.routeDistanceValue = normalizedRoute.distanceIndex?.cumulativeDistances.at(-1) ?? 0;
    this.currentRouteDistanceValue = 0;
    this.isOnRouteValue = false;
    this.distanceFromRouteMetersValue = null;
    this.gradeSegmentIndex = 0;
    this.projectionSegmentIndex = 0;
    this.projectionUpdateCount = 0;
    return true;
  }

  clearCurrentRouteState(): void {
    this.currentRouteValue = null;
    this.routeDistanceValue = 0;
    this.currentRouteDistanceValue = 0;
    this.isOnRouteValue = false;
    this.distanceFromRouteMetersValue = null;
    this.gradeSegmentIndex = 0;
    this.projectionSegmentIndex = 0;
    this.projectionUpdateCount = 0;
  }

  updateRouteProgress(latitude: number, longitude: number): boolean {
    if (!this.hasRoute || !this.currentRouteValue?.coordinates) return false;

    const previousDistance = this.currentRouteDistanceValue;
    const projection = this.projectLocationOntoRoute(latitude, longitude, this.currentRouteValue);
    if (!projection) return false;

    const onRouteThresholdMeters = 40;
    this.distanceFromRouteMetersValue = projection.distanceFromRoute;
    this.isOnRouteValue = projection.distanceFromRoute <= onRouteThresholdMeters;

    if (!this.isOnRouteValue) {
      return false;
    }

    const distanceAlongRoute = Math.min(
      this.routeDistanceValue > 0 ? this.routeDistanceValue : projection.distanceAlongRoute,
      Math.max(0, projection.distanceAlongRoute),
    );
    this.currentRouteDistanceValue = distanceAlongRoute;

    return Math.abs(distanceAlongRoute - previousDistance) > 10;
  }

  updateVirtualRouteDistance(distanceAlongRoute: number): boolean {
    const previousDistance = this.currentRouteDistanceValue;
    this.isOnRouteValue = true;
    this.distanceFromRouteMetersValue = null;
    this.currentRouteDistanceValue = distanceAlongRoute;

    return Math.abs(distanceAlongRoute - previousDistance) > 10;
  }

  private beginOperation(): number {
    this.operationId += 1;
    this.clearCurrentRouteState();
    return this.operationId;
  }

  private createSnapshot(): RouteControllerSnapshot {
    return {
      routeOverrideId: this.routeOverrideId,
      suppressedPlanRouteId: this.suppressedPlanRouteId,
      currentRoute: this.currentRouteValue,
      routeDistance: this.routeDistanceValue,
      currentRouteDistance: this.currentRouteDistanceValue,
    };
  }

  private buildRouteDistanceIndex(
    coordinates: Array<{ latitude: number; longitude: number }>,
  ): NonNullable<LoadedRoute["distanceIndex"]> {
    const segmentDistances: number[] = [];
    const cumulativeDistances: number[] = [0];

    let totalDistance = 0;
    for (let i = 1; i < coordinates.length; i++) {
      const prev = coordinates[i - 1];
      const curr = coordinates[i];
      const segmentDistance = this.calculateDistance(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude,
      );
      segmentDistances.push(segmentDistance);
      totalDistance += segmentDistance;
      cumulativeDistances.push(totalDistance);
    }

    return { cumulativeDistances, segmentDistances };
  }

  private normalizeLoadedRoute(route: LoadedRoute): LoadedRoute {
    const coordinates = route.coordinates.map((coordinate) => ({
      ...coordinate,
      elevation: coordinate.elevation ?? coordinate.altitude,
    }));
    const distanceIndex = this.buildRouteDistanceIndex(coordinates);

    return {
      ...route,
      coordinates,
      distanceIndex,
      elevation_profile:
        route.elevation_profile && route.elevation_profile.length > 1
          ? route.elevation_profile
          : this.buildElevationProfile(coordinates, distanceIndex.cumulativeDistances),
    };
  }

  private buildElevationProfile(
    coordinates: Array<{ latitude: number; longitude: number; elevation?: number }>,
    cumulativeDistances?: number[],
  ): Array<{ distance: number; elevation: number }> | undefined {
    let cumulativeDistance = 0;
    const profile: Array<{ distance: number; elevation: number }> = [];

    for (let index = 0; index < coordinates.length; index += 1) {
      const coordinate = coordinates[index];
      if (!coordinate) continue;

      if (typeof cumulativeDistances?.[index] === "number") {
        cumulativeDistance = cumulativeDistances[index]!;
      } else if (index > 0) {
        const previous = coordinates[index - 1];
        if (previous) {
          cumulativeDistance += this.calculateDistance(
            previous.latitude,
            previous.longitude,
            coordinate.latitude,
            coordinate.longitude,
          );
        }
      }

      if (typeof coordinate.elevation === "number" && Number.isFinite(coordinate.elevation)) {
        profile.push({ distance: cumulativeDistance, elevation: coordinate.elevation });
      }
    }

    return profile.length > 1 ? profile : undefined;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private projectLocationOntoRoute(
    latitude: number,
    longitude: number,
    route: LoadedRoute,
  ): RouteProjection | null {
    const coordinates = route.coordinates;
    if (coordinates.length === 0) return null;
    if (coordinates.length === 1) {
      return {
        distanceAlongRoute: 0,
        distanceFromRoute: this.calculateDistance(
          latitude,
          longitude,
          coordinates[0]?.latitude,
          coordinates[0]?.longitude,
        ),
        segmentIndex: 0,
      };
    }

    const localSearchRadius = 25;
    const maxSegmentIndex = coordinates.length - 2;
    const localStart = Math.max(0, this.projectionSegmentIndex - localSearchRadius);
    const localEnd = Math.min(maxSegmentIndex, this.projectionSegmentIndex + localSearchRadius);
    const localProjection = this.projectLocationOntoRouteSegmentRange(
      latitude,
      longitude,
      route,
      localStart,
      localEnd,
    );

    this.projectionUpdateCount += 1;
    const shouldValidateAgainstFullRoute = this.projectionUpdateCount % 20 === 0;

    if (
      localProjection &&
      localProjection.distanceFromRoute <= 40 &&
      !shouldValidateAgainstFullRoute
    ) {
      this.projectionSegmentIndex = localProjection.segmentIndex;
      return localProjection;
    }

    const fullProjection = this.projectLocationOntoRouteSegmentRange(
      latitude,
      longitude,
      route,
      0,
      maxSegmentIndex,
    );

    if (fullProjection) {
      this.projectionSegmentIndex = fullProjection.segmentIndex;
    }

    return fullProjection;
  }

  private projectLocationOntoRouteSegmentRange(
    latitude: number,
    longitude: number,
    route: LoadedRoute,
    startIndex: number,
    endIndex: number,
  ): RouteProjection | null {
    const coordinates = route.coordinates;
    if (startIndex > endIndex || coordinates.length < 2) return null;

    const anchorLatitude = latitude;
    const metersPerDegreeLatitude = 111_320;
    const metersPerDegreeLongitude =
      Math.cos((anchorLatitude * Math.PI) / 180) * metersPerDegreeLatitude;
    const toPoint = (coordinate: { latitude: number; longitude: number }) => ({
      x: (coordinate.longitude - longitude) * metersPerDegreeLongitude,
      y: (coordinate.latitude - latitude) * metersPerDegreeLatitude,
    });

    let bestDistanceFromRoute = Infinity;
    let bestDistanceAlongRoute = 0;
    let bestSegmentIndex = startIndex;
    let fallbackCumulativeDistance = 0;

    if (!route.distanceIndex) {
      for (let index = 0; index < startIndex; index += 1) {
        const start = coordinates[index]!;
        const end = coordinates[index + 1]!;
        fallbackCumulativeDistance += this.calculateDistance(
          start.latitude,
          start.longitude,
          end.latitude,
          end.longitude,
        );
      }
    }

    for (let index = startIndex; index <= endIndex; index += 1) {
      const start = coordinates[index]!;
      const end = coordinates[index + 1]!;
      const startPoint = toPoint(start);
      const endPoint = toPoint(end);
      const segmentX = endPoint.x - startPoint.x;
      const segmentY = endPoint.y - startPoint.y;
      const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
      const segmentDistance =
        route.distanceIndex?.segmentDistances[index] ??
        this.calculateDistance(start.latitude, start.longitude, end.latitude, end.longitude);
      const cumulativeDistance =
        route.distanceIndex?.cumulativeDistances[index] ?? fallbackCumulativeDistance;
      const projectionRatio =
        segmentLengthSquared > 0
          ? Math.min(
              1,
              Math.max(
                0,
                -(startPoint.x * segmentX + startPoint.y * segmentY) / segmentLengthSquared,
              ),
            )
          : 0;
      const projectedX = startPoint.x + segmentX * projectionRatio;
      const projectedY = startPoint.y + segmentY * projectionRatio;
      const distanceFromRoute = Math.sqrt(projectedX * projectedX + projectedY * projectedY);

      if (distanceFromRoute < bestDistanceFromRoute) {
        bestDistanceFromRoute = distanceFromRoute;
        bestDistanceAlongRoute = cumulativeDistance + segmentDistance * projectionRatio;
        bestSegmentIndex = index;
      }

      fallbackCumulativeDistance += segmentDistance;
    }

    return {
      distanceAlongRoute: bestDistanceAlongRoute,
      distanceFromRoute: bestDistanceFromRoute,
      segmentIndex: bestSegmentIndex,
    };
  }
}
