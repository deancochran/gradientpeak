/**
 * React hooks for recording configuration
 *
 * Provides capability-based feature flags for UI components
 */

import { useCallback, useMemo } from "react";
import type { ActivityRecorderService } from "../services/ActivityRecorder";
import { useSessionView } from "./useActivityRecorder";

/** Canonical recording configuration selector and configuration command boundary. */
export function useRecordingConfig(service: ActivityRecorderService | null) {
  const sessionView = useSessionView(service);
  const attachRoute = useCallback(
    async (routeId: string) => {
      if (!service) return;
      await service.attachRoute(routeId);
    },
    [service],
  );
  const detachRoute = useCallback(() => {
    service?.detachRoute();
  }, [service]);

  return useMemo(
    () => ({
      sessionView,
      recordingConfiguration: sessionView?.recordingConfiguration ?? null,
      sessionContract: sessionView?.recordingConfiguration.session ?? null,
      attachedRouteId: service?.attachedRouteId ?? null,
      attachedRouteName: service?.currentRoute?.name ?? null,
      hasAttachedRoute: service?.attachedRouteId !== undefined && service.attachedRouteId !== null,
      attachRoute,
      detachRoute,
    }),
    [attachRoute, detachRoute, service, sessionView],
  );
}
