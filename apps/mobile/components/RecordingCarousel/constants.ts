// Consistent styling constants for all recording cards
export const CARD_STYLES = {
  wrapper: "flex-1",
  content: "", // Use default CardContent styling
  header: "flex-row items-center justify-between mb-6",
  iconSize: 24,
  sectionHeader: "text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide",
  primaryMetric: "text-5xl font-bold",
  primaryMetricMuted: "text-5xl font-bold opacity-30",
  metricCard: "p-3 bg-muted/10 rounded-lg",
  metricCardColored: (color: string) => `p-3 bg-${color}-500/10 rounded-lg`,
};

export const ZONE_COLORS = {
  active: [
    "bg-gray-400",    // Z1
    "bg-blue-400",    // Z2
    "bg-green-400",   // Z3
    "bg-yellow-400",  // Z4
    "bg-orange-400",  // Z5
    "bg-red-400",     // Z6
    "bg-purple-400",  // Z7
  ],
  inactive: [
    "bg-gray-400/20",    // Z1
    "bg-blue-400/20",    // Z2
    "bg-green-400/20",   // Z3
    "bg-yellow-400/20",  // Z4
    "bg-orange-400/20",  // Z5
    "bg-red-400/20",     // Z6
    "bg-purple-400/20",  // Z7
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
