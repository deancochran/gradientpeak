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
 * // Attach a plan by ID
 * await attachPlan('plan-uuid');
 *
 * // Detach current plan
 * detachPlan();
 * ```
 */
export function useRecordingConfiguration(service: ActivityRecorderService | null) {
  const utils = trpc.useUtils();

  /**
   * Attach a training plan by ID
   * Fetches the plan data and calls service.selectPlan()
   */
  const attachPlan = useCallback(
    async (planId: string) => {
      if (!service) {
        console.warn("[useRecordingConfiguration] No service available");
        return;
      }

      try {
        console.log("[useRecordingConfiguration] Attaching plan:", planId);

        // Fetch plan data
        const planData = await utils.client.trainingPlans.get.query({ id: planId });

        if (!planData) {
          console.error("[useRecordingConfiguration] Plan not found:", planId);
          return;
        }

        // Convert to RecordingServiceActivityPlan format
        const plan = {
          name: planData.name,
          description: planData.description || undefined,
          structure: planData.structure,
          activity_category: service.selectedActivityCategory,
          route_id: undefined, // Plans can have route_id in structure
        };

        // Attach plan to service
        service.selectPlan(plan as any, planId);

        console.log("[useRecordingConfiguration] Plan attached successfully");
      } catch (error) {
        console.error("[useRecordingConfiguration] Failed to attach plan:", error);
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
      console.warn("[useRecordingConfiguration] Route attachment not yet implemented");
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
    console.warn("[useRecordingConfiguration] Route detachment not yet implemented");
  }, [service]);

  return {
    attachPlan,
    detachPlan,
    attachRoute,
    detachRoute,
  };
}
