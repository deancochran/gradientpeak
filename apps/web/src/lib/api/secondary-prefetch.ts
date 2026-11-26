/**
 * Existing non-Suspense sections must render the same pending state on the server
 * and first client render. Streaming an unawaited result into those hooks races
 * hydration. Start these reads early on client navigation; initial documents
 * start them on mount. Only Suspense-owned sections may stream optional SSR data.
 */
export function prefetchSecondary(fetch: () => Promise<void>): void {
  if (typeof window !== "undefined") void fetch().catch(() => undefined);
}
