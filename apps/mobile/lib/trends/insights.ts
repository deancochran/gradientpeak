import {
  Activity,
  BarChart3,
  Flame,
  Gauge,
  HeartPulse,
  Moon,
  Scale,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import type React from "react";
import type {
  CompactInsightLayout,
  InsightSource,
  InsightVisualType,
} from "@/lib/insights/visualPolicy";

export type TrendDirection = "up" | "down" | "flat" | "empty";
export type Tone = "blue" | "green" | "orange" | "pink" | "purple" | "red" | "slate";

export type InsightPoint = { label: string; value: number; date?: Date };
export type InsightSeries = { label: string; tone: Tone; points: InsightPoint[] };
export type Insight = {
  id: string;
  title: string;
  category: string;
  source: InsightSource;
  value: string;
  summary: string;
  detail: string;
  direction: TrendDirection;
  tone: Tone;
  icon: React.ComponentType<{ className?: string; color?: string; size?: number }>;
  visualType: InsightVisualType;
  compactLayout: CompactInsightLayout;
  points: InsightPoint[];
  series?: InsightSeries[];
  rows: { label: string; value: string }[];
};

type ServerTrendInsight = Omit<Insight, "icon" | "points" | "series"> & {
  icon:
    | "activity"
    | "barChart"
    | "flame"
    | "gauge"
    | "heartPulse"
    | "moon"
    | "scale"
    | "sparkles"
    | "trendingUp"
    | "zap";
  points: Array<{ label: string; value: number; date?: string | undefined }>;
  series?:
    | Array<{
        label: string;
        tone: Tone;
        points: Array<{ label: string; value: number; date?: string | undefined }>;
      }>
    | undefined;
};

const iconByKey = {
  activity: Activity,
  barChart: BarChart3,
  flame: Flame,
  gauge: Gauge,
  heartPulse: HeartPulse,
  moon: Moon,
  scale: Scale,
  sparkles: Sparkles,
  trendingUp: TrendingUp,
  zap: Zap,
} satisfies Record<ServerTrendInsight["icon"], Insight["icon"]>;

function hydratePoint(point: ServerTrendInsight["points"][number]): InsightPoint {
  return {
    label: point.label,
    value: point.value,
    ...(point.date === undefined ? {} : { date: new Date(point.date) }),
  };
}

export function hydrateTrendInsights(items: ServerTrendInsight[]): Insight[] {
  return items.map(({ icon, points, series, ...item }) => ({
    ...item,
    icon: iconByKey[icon],
    points: points.map(hydratePoint),
    ...(series === undefined
      ? {}
      : {
          series: series.map((itemSeries) => ({
            ...itemSeries,
            points: itemSeries.points.map(hydratePoint),
          })),
        }),
  }));
}

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}
