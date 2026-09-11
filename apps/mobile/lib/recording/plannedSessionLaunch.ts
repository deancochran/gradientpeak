import {
  ActivityPayloadSchema,
  type RecordingPlannedSessionLaunch,
  type RecordingServiceActivityPlan,
} from "@repo/core";
import type { RecordingLaunchPayload } from "@/lib/stores/activitySelectionStore";
import { hashRecordingPlan } from "./structureHash";

export async function buildPlannedSessionRecordingLaunchPayload(input: {
  plannedSession: RecordingPlannedSessionLaunch;
  eventId?: string;
  name?: string | null;
  description?: string | null;
}): Promise<RecordingLaunchPayload> {
  const { prescription } = input.plannedSession;
  const recomputedHash = `v1:sha256:${await hashRecordingPlan(prescription.structure)}`;
  if (recomputedHash !== prescription.structureHash) {
    throw new Error("Invalid planned-session prescription structure hash");
  }
  const plan: RecordingServiceActivityPlan = {
    id: prescription.activityPlanId,
    name: input.name?.trim() || prescription.variantName,
    description: input.description ?? null,
    structure: prescription.structure,
  };
  const payload = ActivityPayloadSchema.parse({
    activity_category: prescription.structure.activity_category,
    gpsRecordingEnabled: false,
    ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
    plan,
    plannedSession: input.plannedSession,
  });
  return { ...payload, launchSource: "calendar_event" };
}
