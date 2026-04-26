import type { RouteCoordinate } from "../../lib/recording-web";
import { projectRoutePreview } from "../../lib/recording-web";

type RoutePreviewMapProps = {
  coordinates: RouteCoordinate[];
};

export function RoutePreviewMap({ coordinates }: RoutePreviewMapProps) {
  const projection = projectRoutePreview(coordinates);

  if (!projection) {
    return (
      <div className="flex h-60 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
        No route geometry available for preview.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-br from-muted/70 via-background to-muted/30">
      <svg
        aria-label="Route preview"
        className="h-60 w-full"
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
