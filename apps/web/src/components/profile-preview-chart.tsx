import {
  type ProfileChartInputPoint,
  projectProfileChartPoints,
  serializeProfileChartPoints,
} from "@repo/core";

export function ProfilePreviewChart({
  accessibilityLabel,
  label,
  samples,
  summary,
  testId,
}: {
  accessibilityLabel: string;
  label: string;
  samples: readonly ProfileChartInputPoint[];
  summary: string;
  testId: string;
}) {
  const projected = projectProfileChartPoints(samples);
  const points = serializeProfileChartPoints(projected);
  if (!points) return null;
  return (
    <section className="space-y-2" data-testid={testId}>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{summary}</p>
      </div>
      <div
        aria-label={accessibilityLabel}
        className="h-16 overflow-hidden rounded-xl border border-primary/20 bg-primary/5 px-2 py-1"
        role="img"
      >
        <svg
          aria-hidden="true"
          className="block h-full w-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 48"
        >
          <polyline
            className="text-primary"
            fill="none"
            points={points}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
          {projected.length === 1 && projected[0] ? (
            <circle
              className="text-primary"
              cx={projected[0].x}
              cy={projected[0].y}
              fill="currentColor"
              r="2.5"
            />
          ) : null}
        </svg>
      </div>
    </section>
  );
}
