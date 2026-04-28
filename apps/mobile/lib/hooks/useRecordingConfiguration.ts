import { useCallback } from "react";
import type { ActivityRecorderService } from "../services/ActivityRecorder";
import { useSessionView } from "./useActivityRecorder";
import { useRecordingSessionContract } from "./useRecordingConfig";

export function useRecordingConfiguration(service: ActivityRecorderService | null) {
  const sessionView = useSessionView(service);
  const sessionContract = useRecordingSessionContract(service);
  const recordingConfiguration = sessionView?.recordingConfiguration ?? null;
  const attachedRouteId = service?.attachedRouteId ?? null;
  const attachedRouteName = service?.currentRoute?.name ?? null;

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

  return {
    recordingConfiguration,
    sessionContract,
    attachedRouteId,
    attachedRouteName,
    hasAttachedRoute: attachedRouteId !== null,
    attachRoute,
    detachRoute,
  };
}
