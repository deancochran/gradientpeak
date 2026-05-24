import { useFocusEffect } from "@react-navigation/native";
import React from "react";

export type PerformanceMetric = {
  durationMs: number;
  id: string;
  measuredAt: number;
};

const starts = new Map<string, number>();
const metrics = new Map<string, PerformanceMetric>();
const listeners = new Set<() => void>();
let cachedMetricsSnapshot: PerformanceMetric[] = [];
let cachedMetricsVersion = -1;
let metricsVersion = 0;

export function isPerformanceTestingEnabled() {
  return process.env.EXPO_PUBLIC_PERF_TEST === "1" || process.env.EXPO_PUBLIC_MAESTRO_E2E === "1";
}

export function toPerformanceRouteKey(value: unknown) {
  if (typeof value === "object" && value && "pathname" in value) {
    return toPerformanceRouteKey((value as { pathname?: unknown }).pathname);
  }

  if (typeof value !== "string") return "unknown";

  const normalized = value
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]+\]/g, "detail")
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || "home";
}

export function markNavigationStart(id: string) {
  if (!isPerformanceTestingEnabled()) return;
  starts.set(id, now());
}

export function markInteractionStart(id: string) {
  markNavigationStart(id);
}

export function markPerformanceReady(id: string) {
  if (!isPerformanceTestingEnabled()) return;

  const completedAt = now();
  const startedAt = starts.get(id) ?? completedAt;
  metrics.set(id, {
    durationMs: Math.max(0, completedAt - startedAt),
    id,
    measuredAt: Date.now(),
  });
  metricsVersion += 1;
  starts.delete(id);
  emitChange();
}

export function usePerformanceScreenReady(id: string, enabled = true) {
  useFocusEffect(
    React.useCallback(() => {
      if (!enabled || !isPerformanceTestingEnabled()) return undefined;

      const frame = requestAnimationFrame(() => markPerformanceReady(id));
      return () => cancelAnimationFrame(frame);
    }, [enabled, id]),
  );
}

export function subscribeToPerformanceMetrics(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPerformanceMetricsSnapshot() {
  if (cachedMetricsVersion !== metricsVersion) {
    cachedMetricsSnapshot = [...metrics.values()].sort((a, b) => a.id.localeCompare(b.id));
    cachedMetricsVersion = metricsVersion;
  }

  return cachedMetricsSnapshot;
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
