import { providerHasCapability } from "@repo/core";

export const wahooPlannedActivityRequiredScopes = [
  "plans_read",
  "plans_write",
  "workouts_read",
  "workouts_write",
] as const;

export function hasWahooPlannedActivityScopes(scope: string | null | undefined): boolean {
  const granted = new Set((scope ?? "").split(/[\s,]+/).filter(Boolean));
  return wahooPlannedActivityRequiredScopes.every((required) => granted.has(required));
}

export const wahooRouteMirrorRequiredScopes = [
  "routes_read",
  "routes_write",
  "offline_data",
] as const;

export function hasWahooRouteMirrorScopes(scope: string | null | undefined): boolean {
  if (!providerHasCapability("wahoo", "route_push")) return false;
  const granted = new Set((scope ?? "").split(/[\s,]+/).filter(Boolean));
  return wahooRouteMirrorRequiredScopes.every((required) => granted.has(required));
}
