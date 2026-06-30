import { createFromCreationConfigInputSchema, type PreviewCreationConfigInput } from "@repo/core";
import type { BackendCreateCommitMappingResult, BackendUpdateCommitMappingResult } from "./types";

export function mapBackendPlanningCreateCommitInput({
  isActive = true,
  previewInput,
  previewSnapshotToken,
}: {
  isActive?: boolean;
  previewInput: PreviewCreationConfigInput | null;
  previewSnapshotToken: string | null | undefined;
}): BackendCreateCommitMappingResult {
  if (!previewInput) return { ok: false, reason: "Backend preview input is unavailable." };
  if (!previewSnapshotToken)
    return { ok: false, reason: "Backend preview snapshot token is unavailable." };

  const parsed = createFromCreationConfigInputSchema.safeParse({
    ...previewInput,
    is_active: isActive,
    preview_snapshot_token: previewSnapshotToken,
  });
  if (!parsed.success) {
    return {
      ok: false,
      reason: `Backend create input is incomplete: ${parsed.error.issues[0]?.message ?? "unknown validation issue"}`,
    };
  }
  return { ok: true, input: parsed.data };
}

export function mapBackendPlanningUpdateCommitInput({
  isActive = true,
  planId,
  previewInput,
  previewSnapshotToken,
}: {
  isActive?: boolean;
  planId: string | null | undefined;
  previewInput: PreviewCreationConfigInput | null;
  previewSnapshotToken: string | null | undefined;
}): BackendUpdateCommitMappingResult {
  if (!planId) return { ok: false, reason: "Training plan id is required for backend update." };
  if (!UUID_PATTERN.test(planId))
    return { ok: false, reason: "Training plan id must be a UUID for backend update." };

  const createMapping = mapBackendPlanningCreateCommitInput({
    isActive,
    previewInput,
    previewSnapshotToken,
  });
  if (!createMapping.ok) return createMapping;
  return { ok: true, input: { ...createMapping.input, plan_id: planId } };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
