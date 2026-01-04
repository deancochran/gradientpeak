// Consistent styling constants for all recording cards
export const CARD_STYLES = {
  // Container styles
  outerContainer: "flex-1 p-4",
  content: "p-5", // Standard padding for all card content

  // Section headers
  sectionHeader:
    "text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide",

  // Primary metrics (large display at top of cards)
  primaryMetric: "text-5xl font-bold",
  primaryMetricMuted: "text-5xl font-bold opacity-30",
  primaryMetricContainer: "items-center mb-6",

  // Metric cards (small data displays)
  metricCard: "p-3 bg-muted/10 rounded-lg",
  metricCardColored: (color: string) => `p-3 bg-${color}-500/10 rounded-lg`,

  // Layout constants
  rowGap: "mb-3", // Vertical spacing between rows
  columnGap: "gap-3", // Horizontal spacing in flex-row
  sectionGap: "gap-4", // Spacing between major sections
};

export const ZONE_COLORS = {
  active: [
    "bg-gray-400", // Z1
    "bg-blue-400", // Z2
    "bg-green-400", // Z3
    "bg-yellow-400", // Z4
    "bg-orange-400", // Z5
    "bg-red-400", // Z6
    "bg-purple-400", // Z7
  ],
  inactive: [
    "bg-gray-400/20", // Z1
    "bg-blue-400/20", // Z2
    "bg-green-400/20", // Z3
    "bg-yellow-400/20", // Z4
    "bg-orange-400/20", // Z5
    "bg-red-400/20", // Z6
    "bg-purple-400/20", // Z7
  ],
};

export const ANIMATIONS = {
  transition: "transition-all duration-300 ease-in-out",
  metricChange: "transition-transform duration-200 ease-out",
  barGrowth: "transition-all duration-500 ease-in-out",
  valueChange: "transition-all duration-300 ease-in-out",
};

export const ZONE_CHART_CONFIG = {
  maxBarHeight: 80,
  minBarHeight: 12,
  gap: 2,
};

// Dashboard-specific styles
export const DASHBOARD_STYLES = {
  // Adaptive header - takes 1/4 of available space
  adaptiveHeader: "w-full mb-4",
  adaptiveHeaderHeight: 0.25, // 25% of available card height

  // Interval progress section
  intervalProgress: "flex-col gap-2 w-full",
  countdownTimer: "text-lg font-semibold text-center mb-1",
  progressBarContainer:
    "w-full bg-muted/20 rounded-full h-3 border-2 border-muted overflow-hidden",
  progressBarFill: "h-full rounded-full transition-all duration-300",
  nextStepPreview: "text-xs text-center text-muted-foreground mt-1",

  // Session timer (free-form)
  sessionTimerLarge: "text-6xl font-bold text-center",
  sessionTimerContainer: "items-center justify-center",

  // Unified metric card
  metricCardUnified: "flex-col p-3 bg-muted/10 rounded-lg border-2",
  metricCardDefault: "border-transparent",
  metricCardTargeted: "border-primary",
  metricCardBelow: "border-orange-500",
  metricCardAbove: "border-red-500",

  metricTitle: "text-xs text-muted-foreground mb-1 uppercase tracking-wide",
  metricValue: "text-3xl font-bold",
  metricUnit: "text-xs text-muted-foreground mt-0.5",
  metricTarget: "text-xs text-muted-foreground mt-1",

  // Metrics grid
  metricsGrid: "flex-1 flex-row flex-wrap gap-3 overflow-hidden",
  metricContainer: "flex-1 min-w-[45%]", // Ensures 2 per row minimum
};
