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
  const manifest = prescription.resolutionManifest;
  const recomputedHash = `v1:sha256:${await hashRecordingPlan(manifest.resolved_structure)}`;
  if (recomputedHash !== manifest.resolved_structure_hash) {
    throw new Error("Invalid planned-session prescription structure hash");
  }
  const plan: RecordingServiceActivityPlan = {
    id: manifest.activity_plan_id,
    name: input.name?.trim() || "Scheduled activity plan",
    description: input.description ?? null,
    structure: manifest.resolved_structure,
  };
  const payload = ActivityPayloadSchema.parse({
    activity_category: manifest.resolved_structure.activity_category,
    gpsRecordingEnabled: false,
    ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
    plan,
    plannedSession: input.plannedSession,
  });
  return { ...payload, launchSource: "calendar_event" };
}
