import type { RouteCoordinate } from "../../lib/recording-web";
import { projectRoutePreview } from "../../lib/recording-web";

type RoutePreviewMapProps = {
  compact?: boolean;
  coordinates: RouteCoordinate[];
};

function hasValidRouteGeometry(coordinates: RouteCoordinate[]) {
  return (
    coordinates.length >= 2 &&
    coordinates.every(
      ({ latitude, longitude }) =>
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180,
    )
  );
}

export function RoutePreviewMap({ compact = false, coordinates }: RoutePreviewMapProps) {
  const projection = hasValidRouteGeometry(coordinates) ? projectRoutePreview(coordinates) : null;
  const heightClassName = compact ? "h-36" : "h-60";
  const unavailableMessage = compact
    ? "Route preview unavailable."
    : "No route geometry available for preview.";

  if (!projection) {
    return (
      <div
        className={`flex ${heightClassName} items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground`}
        data-testid="route-preview-unavailable"
      >
        {unavailableMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-br from-muted/70 via-background to-muted/30">
      <svg
        aria-label="Route preview"
        className={`${heightClassName} w-full`}
        role="img"
        viewBox={`0 0 ${projection.width} ${projection.height}`}
      >
        <polyline
          fill="none"
          points={projection.points}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5"
          className="text-primary"
        />
        <circle
          cx={projection.start.x}
          cy={projection.start.y}
          r="7"
          className="fill-emerald-500"
        />
        <circle cx={projection.finish.x} cy={projection.finish.y} r="7" className="fill-rose-500" />
      </svg>
    </div>
  );
}
