import {
  ACTIVITY_PLAN_COMPILER_VERSION,
  activityPlanStructureSchema,
  athletePerformanceTargetFactsSchema,
  canonicalActivityCategorySchema,
  compileActivityPlan,
  recordingCheckpointSchema,
} from "@repo/core";
import { z } from "zod";
import {
  claimRecordingEvidenceCheckpoint,
  clearRecordingEvidenceCheckpoint,
  hasQuarantinedRecordingEvidence as hasQuarantinedJournalEvidence,
  persistRecordingEvidenceCheckpoint,
  quarantineOrphanedActiveRecordingEvidenceSessions,
  quarantineRecordingEvidenceSession,
  readRecordingEvidenceCheckpoint,
  releaseRecordingEvidenceCheckpointClaim,
} from "./recordingEvidenceJournal";

export const MOBILE_RECORDING_CHECKPOINT_SCHEMA_VERSION = 5 as const;

// This is mobile recovery state, not a cross-surface session contract. Keep it
// local so an unplanned launch never invents a plan/hash just to fit the older
// planned checkpoint shape.
const unplannedRecordingCheckpointSchema = z
  .object({
    schemaVersion: z.literal(MOBILE_RECORDING_CHECKPOINT_SCHEMA_VERSION),
    variant: z.literal("unplanned"),
    sessionId: z.string().min(1),
    profileId: z.string().min(1),
    lifecycle: z.enum(["recording", "paused", "finishing"]),
    revision: z.number().int().positive(),
    start: z
      .object({ startedAt: z.string().datetime(), updatedAt: z.string().datetime() })
      .strict(),
    draft: z
      .object({
        activity_category: canonicalActivityCategorySchema,
        gpsMode: z.enum(["on", "off"]),
      })
      .strict(),
    summary: z
      .object({
        elapsedSeconds: z.number().nonnegative(),
        movingSeconds: z.number().nonnegative(),
        distanceMeters: z.number().nonnegative(),
      })
      .strict(),
    executionState: z
      .object({
        timerEvents: z.array(
          z
            .object({ type: z.enum(["pause", "resume"]), timestamp: z.string().datetime() })
            .strict(),
        ),
        manualLapsMs: z.array(z.number().int().min(0)).max(10_000).default([]),
      })
      .strict(),
    performanceTargets: athletePerformanceTargetFactsSchema,
    streamArtifactPaths: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((checkpoint, context) => {
    if (Date.parse(checkpoint.performanceTargets.asOf) > Date.parse(checkpoint.start.startedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Checkpoint performance targets cannot be observed after session start",
        path: ["performanceTargets", "asOf"],
      });
    }
  });
const plannedRecordingCheckpointSchema = z
  .object({
    ...recordingCheckpointSchema.shape,
    schemaVersion: z.literal(MOBILE_RECORDING_CHECKPOINT_SCHEMA_VERSION),
    variant: z.literal("planned"),
  })
  .strict()
  .superRefine((checkpoint, context) => {
    if (Date.parse(checkpoint.performanceTargets.asOf) > Date.parse(checkpoint.timing.startedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Checkpoint performance targets cannot be observed after session start",
        path: ["performanceTargets", "asOf"],
      });
    }
  });
export const activityRecorderCheckpointSchema = z.discriminatedUnion("variant", [
  plannedRecordingCheckpointSchema,
  unplannedRecordingCheckpointSchema,
]);
export type ActivityRecorderCheckpoint = z.infer<typeof activityRecorderCheckpointSchema>;
export type PlannedRecordingCheckpoint = z.infer<typeof plannedRecordingCheckpointSchema>;
export type UnplannedRecordingCheckpoint = z.infer<typeof unplannedRecordingCheckpointSchema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function hashRecordingPlan(planSnapshot: unknown): Promise<string> {
  const parsed = activityPlanStructureSchema.parse(planSnapshot);
  const { CryptoDigestAlgorithm, digestStringAsync } = await import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, canonicalJson(parsed));
}

async function quarantineRecoveredEvidence(
  sessionId: string,
  profileId: string,
  reason: string,
): Promise<void> {
  const quarantined = await quarantineRecordingEvidenceSession({ sessionId, profileId, reason });
  if (!quarantined) {
    await quarantineOrphanedActiveRecordingEvidenceSessions(
      profileId,
      validateStoredRecordingEvidenceCheckpoint,
    );
  }
}

async function handleJournalCheckpointFailure(
  profileId: string,
  error: unknown,
): Promise<RecordingCheckpointRecovery> {
  const reason = error instanceof Error ? error.message : "Unreadable checkpoint";
  await quarantineOrphanedActiveRecordingEvidenceSessions(
    profileId,
    validateStoredRecordingEvidenceCheckpoint,
  );
  return { status: "quarantined", reason };
}

function assertRecoveryJournal(checkpoint: PlannedRecordingCheckpoint): void {
  if (checkpoint.occurrenceProgress.startMovingSeconds > checkpoint.timing.movingSeconds) {
    throw new Error("Occurrence start counters exceed checkpoint progress");
  }
  if (
    checkpoint.occurrenceProgress.startedAt < checkpoint.timing.startedAt ||
    checkpoint.occurrenceProgress.startedAt > checkpoint.timing.updatedAt
  ) {
    throw new Error("Occurrence start timestamp is outside checkpoint timing bounds");
  }
  const attemptIds = new Set<string>();
  for (const rewind of checkpoint.rewindJournal ?? []) {
    if (attemptIds.has(rewind.attemptId)) throw new Error("Duplicate recording rewind attempt");
    attemptIds.add(rewind.attemptId);
    if (rewind.supersededFrom >= rewind.rewoundAt) {
      throw new Error("Recording rewind evidence window is invalid");
    }
    if (
      (rewind.sourceDistanceMeters === undefined) !==
      (rewind.destinationDistanceMeters === undefined)
    ) {
      throw new Error("Recording rewind distance rebase is incomplete");
    }
  }
  const compiled = compileActivityPlan(checkpoint.planSnapshot);
  const ids = compiled.occurrences.map((item) => item.occurrenceId);
  const completedIds = checkpoint.completedOccurrences.map((item) => item.occurrenceId);
  if (completedIds.some((id, index) => ids[index] !== id)) {
    throw new Error("Completed occurrence journal does not match deterministic compilation");
  }
  const expectedCurrent = ids[completedIds.length] ?? null;
  if (checkpoint.currentOccurrenceId !== expectedCurrent) {
    throw new Error("Current occurrence does not follow the completed journal");
  }
  checkpoint.boundaryJournal.forEach((entry, index) => {
    const previous = checkpoint.boundaryJournal[index - 1];
    if (entry.revision > checkpoint.revision || (previous && entry.revision <= previous.revision)) {
      throw new Error("Boundary journal revisions are not monotonic");
    }
    if (entry.completedOccurrenceId) {
      const completedIndex = completedIds.indexOf(entry.completedOccurrenceId);
      if (completedIndex < 0 || entry.nextOccurrenceId !== (ids[completedIndex + 1] ?? null)) {
        throw new Error("Boundary journal occurrence IDs do not match deterministic compilation");
      }
    }
  });
  const lastBoundary = checkpoint.boundaryJournal.at(-1);
  if (
    lastBoundary?.completedOccurrenceId === null &&
    lastBoundary.nextOccurrenceId !== checkpoint.currentOccurrenceId
  ) {
    throw new Error("Navigation boundary does not match the recoverable occurrence cursor");
  }
  checkpoint.eventJournal.forEach((event, index) => {
    const previous = checkpoint.eventJournal[index - 1];
    if (previous && (event.type === previous.type || event.timestamp < previous.timestamp)) {
      throw new Error("Pause event journal is not ordered or alternating");
    }
  });
}

async function parseAndValidateCheckpoint(
  raw: string,
  profileId: string,
): Promise<ActivityRecorderCheckpoint> {
  const checkpoint = activityRecorderCheckpointSchema.parse(JSON.parse(raw));
  if (checkpoint.profileId !== profileId) throw new Error("Checkpoint profile does not match");
  if (checkpoint.variant === "unplanned") {
    if (
      checkpoint.executionState.timerEvents.some(
        (event, index, events) =>
          index > 0 && event.timestamp < (events[index - 1]?.timestamp ?? ""),
      )
    ) {
      throw new Error("Unplanned checkpoint timer journal is not ordered");
    }
    return checkpoint;
  }
  if (checkpoint.compilerVersion !== ACTIVITY_PLAN_COMPILER_VERSION) {
    throw new Error("Checkpoint compiler version is unsupported");
  }
  if ((await hashRecordingPlan(checkpoint.planSnapshot)) !== checkpoint.planHash) {
    throw new Error("Checkpoint plan hash does not match its snapshot");
  }
  assertRecoveryJournal(checkpoint);
  return checkpoint;
}

/** Injected into SQLite orphan inspection to keep its adapter independent. */
export async function validateStoredRecordingEvidenceCheckpoint(input: {
  checkpointJson: string;
  sessionId: string;
  profileId: string;
}): Promise<boolean> {
  try {
    const checkpoint = await parseAndValidateCheckpoint(input.checkpointJson, input.profileId);
    return checkpoint.sessionId === input.sessionId && checkpoint.profileId === input.profileId;
  } catch {
    return false;
  }
}

export async function persistRecordingCheckpoint(
  checkpoint: ActivityRecorderCheckpoint,
): Promise<void> {
  const parsed = activityRecorderCheckpointSchema.parse(checkpoint);
  const existing = await readRecordingEvidenceCheckpoint(parsed.profileId);
  if (existing?.sessionId === parsed.sessionId) {
    try {
      const previous = activityRecorderCheckpointSchema.parse(JSON.parse(existing.checkpointJson));
      if (previous.revision >= parsed.revision)
        throw new Error("Recording checkpoint revision must increase monotonically");
    } catch (error) {
      if (error instanceof Error && error.message.includes("revision must increase")) throw error;
      await quarantineRecoveredEvidence(
        existing.sessionId,
        parsed.profileId,
        error instanceof Error ? error.message : "Unreadable checkpoint",
      );
      throw error;
    }
  }
  await persistRecordingEvidenceCheckpoint({
    sessionId: parsed.sessionId,
    profileId: parsed.profileId,
    checkpoint: parsed,
  });
}

export type RecordingCheckpointRecovery =
  | { status: "none" }
  | { status: "recovered"; checkpoint: ActivityRecorderCheckpoint }
  | { status: "quarantined"; reason: string };

export async function inspectRecordingCheckpoint(
  profileId: string,
): Promise<RecordingCheckpointRecovery> {
  let row: Awaited<ReturnType<typeof readRecordingEvidenceCheckpoint>>;
  try {
    row = await readRecordingEvidenceCheckpoint(profileId);
  } catch (error) {
    return handleJournalCheckpointFailure(profileId, error);
  }
  if (!row) return { status: "none" };
  try {
    const checkpoint = await parseAndValidateCheckpoint(row.checkpointJson, profileId);
    if (checkpoint.sessionId !== row.sessionId)
      throw new Error("Checkpoint session does not match evidence");
    return {
      status: "recovered",
      checkpoint,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unreadable checkpoint";
    await quarantineRecoveredEvidence(row.sessionId, profileId, reason);
    return { status: "quarantined", reason };
  }
}

export async function loadAndClaimRecordingCheckpoint(
  profileId: string,
): Promise<RecordingCheckpointRecovery> {
  let row: Awaited<ReturnType<typeof claimRecordingEvidenceCheckpoint>>;
  try {
    row = await claimRecordingEvidenceCheckpoint(profileId);
  } catch (error) {
    return handleJournalCheckpointFailure(profileId, error);
  }
  if (!row) return { status: "none" };
  try {
    const checkpoint = await parseAndValidateCheckpoint(row.checkpointJson, profileId);
    if (checkpoint.sessionId !== row.sessionId)
      throw new Error("Checkpoint session does not match evidence");
    return { status: "recovered", checkpoint };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unreadable checkpoint";
    // Parsing happens after the journal row is claimed. Release that in-process
    // claim even when quarantine itself cannot complete, so a malformed row
    // cannot hide later recovery attempts for the lifetime of the app process.
    releaseRecordingEvidenceCheckpointClaim(row.sessionId);
    await quarantineRecoveredEvidence(row.sessionId, profileId, reason);
    return { status: "quarantined", reason };
  }
}

export async function quarantineActiveRecordingCheckpoint(
  reason: string,
  profileId: string,
  sessionId: string,
): Promise<void> {
  await quarantineRecoveredEvidence(sessionId, profileId, reason);
}

export async function hasQuarantinedRecordingEvidence(): Promise<boolean> {
  return hasQuarantinedJournalEvidence();
}

export function releaseRecordingCheckpointClaim(sessionId: string): void {
  releaseRecordingEvidenceCheckpointClaim(sessionId);
}

export async function clearRecordingCheckpoint(sessionId: string): Promise<void> {
  await clearRecordingEvidenceCheckpoint(sessionId);
}
