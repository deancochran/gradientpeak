import {
  type ActivityPrescriptionQuantificationBundle,
  createPrescriptionQuantificationBundle,
} from "../activity-quantification";
import type { CanonicalActivityCategory } from "../schemas/activity-category";

export type PlannedDaySummaryEvent = {
  prescriptionQuantification: ActivityPrescriptionQuantificationBundle;
};

export type PlannedDaySummary = {
  eventCount: number;
  activity_categories: CanonicalActivityCategory[];
  totalDurationSeconds: number | null;
  totalLoad: number | null;
  prescriptionQuantification: ActivityPrescriptionQuantificationBundle;
};

/** Summarizes already-authorized independent planned events without combining their execution. */
export function summarizePlannedDay(events: readonly PlannedDaySummaryEvent[]): PlannedDaySummary {
  const prescriptionQuantification = createPrescriptionQuantificationBundle({
    members: events.flatMap((event) => event.prescriptionQuantification.members),
  });
  const elapsed = prescriptionQuantification.summary.duration.elapsed;
  const commonLoad = prescriptionQuantification.summary.commonLoad;

  return {
    eventCount: events.length,
    activity_categories: prescriptionQuantification.summary.activity_categories,
    totalDurationSeconds: elapsed.status === "complete" ? elapsed.value : null,
    totalLoad: commonLoad.status === "complete" ? commonLoad.load : null,
    prescriptionQuantification,
  };
}
