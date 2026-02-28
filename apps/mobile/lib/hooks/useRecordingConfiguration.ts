/**
 * useRecordingConfiguration
 *
 * Hook for managing recording configuration (plan/route attachment/detachment).
 * Provides methods to attach/detach plans and routes during recording.
 */

import { useCallback } from "react";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { trpc } from "@/lib/trpc";

/**
 * Hook to manage recording configuration (plan/route attachment/detachment)
 *
 * @param service - ActivityRecorderService instance
 * @returns Configuration management methods
 *
 * @example
 * ```tsx
 * const { attachPlan, detachPlan, attachRoute, detachRoute } = useRecordingConfiguration(service);
 *
 * // Attach from a scheduled event ID
 * await attachPlan('event-uuid');
 *
 * // Detach current plan
 * detachPlan();
 * ```
 */
export function useRecordingConfiguration(
  service: ActivityRecorderService | null,
) {
  const utils = trpc.useUtils();

  /**
   * Attach a scheduled event by ID
   * Fetches linked activity plan data and calls service.selectPlan()
   */
  const attachPlan = useCallback(
    async (eventId: string) => {
      if (!service) {
        console.warn("[useRecordingConfiguration] No service available");
        return;
      }

      try {
        console.log(
          "[useRecordingConfiguration] Attaching plan from event:",
          eventId,
        );

        const eventData = await utils.client.events.getById.query({
          id: eventId,
        });

        if (!eventData?.activity_plan_id) {
          console.error(
            "[useRecordingConfiguration] Event has no linked activity plan:",
            eventId,
          );
          return;
        }

        const planData = await utils.client.activityPlans.getById.query({
          id: eventData.activity_plan_id,
        });

        if (!planData) {
          console.error(
            "[useRecordingConfiguration] Activity plan not found for event:",
            eventId,
          );
          return;
        }

        // Convert to RecordingServiceActivityPlan format
        const plan = {
          name: planData.name,
          description: planData.description || undefined,
          structure: planData.structure,
          activity_category:
            planData.activity_category || service.selectedActivityCategory,
          route_id: planData.route_id || undefined,
        };

        // Attach plan to service
        service.selectPlan(plan as any, eventId);

        console.log("[useRecordingConfiguration] Plan attached successfully");
      } catch (error) {
        console.error(
          "[useRecordingConfiguration] Failed to attach plan:",
          error,
        );
      }
    },
    [service, utils],
  );

  /**
   * Detach the current training plan
   * Calls service.clearPlan()
   */
  const detachPlan = useCallback(() => {
    if (!service) {
      console.warn("[useRecordingConfiguration] No service available");
      return;
    }

    console.log("[useRecordingConfiguration] Detaching plan");
    service.clearPlan();
  }, [service]);

  /**
   * Attach a route by ID
   * TODO: Implement route attachment logic
   * Currently routes are only loaded via plans
   */
  const attachRoute = useCallback(
    async (routeId: string) => {
      if (!service) {
        console.warn("[useRecordingConfiguration] No service available");
        return;
      }

      console.log("[useRecordingConfiguration] Attaching route:", routeId);

      // TODO: Implement route attachment
      // This will require adding a public method to ActivityRecorderService
      // to load routes directly (not just via plans)
      console.warn(
        "[useRecordingConfiguration] Route attachment not yet implemented",
      );
    },
    [service],
  );

  /**
   * Detach the current route
   * TODO: Implement route detachment logic
   */
  const detachRoute = useCallback(() => {
    if (!service) {
      console.warn("[useRecordingConfiguration] No service available");
      return;
    }

    console.log("[useRecordingConfiguration] Detaching route");

    // TODO: Implement route detachment
    // This will require adding a public method to ActivityRecorderService
    console.warn(
      "[useRecordingConfiguration] Route detachment not yet implemented",
    );
  }, [service]);

  return {
    attachPlan,
    detachPlan,
    attachRoute,
    detachRoute,
  };
}
