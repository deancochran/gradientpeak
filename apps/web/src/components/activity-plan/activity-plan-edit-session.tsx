import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { useState } from "react";
import { type ActivityPlanAuthoringValues, ActivityPlanComposer } from "./activity-plan-composer";

type EditSnapshot = NonNullable<inferRouterOutputs<AppRouter>["activityPlans"]["getById"]["edit"]>;

/** Freeze the loaded document and concurrency tokens together for this editing session. */
export function ActivityPlanEditSession({
  edit,
  onCancel,
  onUpdate,
  pending,
  onSaved,
}: {
  edit: EditSnapshot;
  onCancel: () => void;
  onUpdate: (
    input: ActivityPlanAuthoringValues & {
      id: string;
      expectedStructureHash: string;
      expectedRevision: number;
    },
  ) => Promise<unknown>;
  pending: boolean;
  onSaved?: () => Promise<void> | void;
}) {
  const [snapshot] = useState(edit);
  return (
    <ActivityPlanComposer
      initial={{
        name: snapshot.name,
        description: snapshot.description,
        notes: snapshot.notes,
        structure: snapshot.structure,
        gps_recording_enabled: snapshot.gpsRecordingEnabled,
        content_visibility: snapshot.contentVisibility,
        training_intent: snapshot.trainingIntent,
        adaptation: snapshot.adaptation,
      }}
      mode="edit"
      onCancel={onCancel}
      pending={pending}
      {...(onSaved === undefined ? {} : { onSaved })}
      onSave={async (values) => {
        await onUpdate({
          ...values,
          id: snapshot.id,
          expectedStructureHash: snapshot.structureHash,
          expectedRevision: snapshot.activityPlanRevision,
        });
      }}
    />
  );
}
