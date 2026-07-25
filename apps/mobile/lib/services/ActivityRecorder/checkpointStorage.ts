import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ACTIVITY_PLAN_COMPILER_VERSION,
  activityPlanStructureSchemaV3,
  compileActivityPlanV3,
  type RecordingCheckpoint,
  recordingCheckpointSchema,
} from "@repo/core";
import { z } from "zod";
import {
  loadRecordingEvidenceCheckpoint,
  persistRecordingEvidenceCheckpoint,
  quarantineOrphanedActiveRecordingEvidenceSessions,
  quarantineRecordingEvidenceSession,
} from "./recordingEvidenceJournal";

export const ACTIVE_RECORDING_CHECKPOINT_KEY = "activity-recorder:v3:active-checkpoint";
export const QUARANTINED_RECORDING_CHECKPOINT_KEY = "activity-recorder:v3:quarantined-checkpoint";
let claimedSessionId: string | null = null;

// This is mobile recovery state, not a cross-surface session contract. Keep it
// local so an unplanned launch never invents a plan/hash just to fit the older
// planned checkpoint shape.
const unplannedRecordingCheckpointSchema = z
  .object({
    schemaVersion: z.literal(3),
    variant: z.literal("unplanned"),
    sessionId: z.string().min(1),
    profileId: z.string().min(1),
    lifecycle: z.enum(["recording", "paused", "finishing"]),
    revision: z.number().int().positive(),
    start: z
      .object({ startedAt: z.string().datetime(), updatedAt: z.string().datetime() })
      .strict(),
    draft: z
      .object({ activityCategory: z.string().min(1), gpsMode: z.enum(["on", "off"]) })
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
      })
      .strict(),
    streamArtifactPaths: z.array(z.string().min(1)),
  })
  .strict();
const plannedRecordingCheckpointSchema = recordingCheckpointSchema
  .extend({ variant: z.literal("planned") })
  .strict();
export const activityRecorderCheckpointSchema = z.discriminatedUnion("variant", [
  plannedRecordingCheckpointSchema,
  unplannedRecordingCheckpointSchema,
]);
export type ActivityRecorderCheckpoint = z.infer<typeof activityRecorderCheckpointSchema>;
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
  const parsed = activityPlanStructureSchemaV3.parse(planSnapshot);
  const { CryptoDigestAlgorithm, digestStringAsync } = await import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, canonicalJson(parsed));
}

async function quarantine(raw: string, reason: string): Promise<void> {
  // AsyncStorage is a best-effort compatibility mirror. It is intentionally
  // not part of the recovery authority and may be unavailable on headless
  // startup, so a mirror failure cannot hide SQLite evidence.
  try {
    await AsyncStorage.setItem(
      QUARANTINED_RECORDING_CHECKPOINT_KEY,
      JSON.stringify({ quarantinedAt: new Date().toISOString(), reason, raw }),
    );
    await AsyncStorage.removeItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  } catch {}
}

async function quarantineRecoveredEvidence(
  raw: string,
  profileId: string,
  reason: string,
): Promise<void> {
  // Only an independently parsed identity may target SQLite. Corrupt bytes do
  // not get to nominate a session; orphan cleanup inspects SQLite instead.
  try {
    const candidate = JSON.parse(raw) as { sessionId?: unknown; profileId?: unknown };
    if (typeof candidate.sessionId === "string" && candidate.profileId === profileId) {
      const quarantined = await quarantineRecordingEvidenceSession({
        sessionId: candidate.sessionId,
        profileId,
        reason,
      });
      // Compatibility storage can contain a stale session ID. A conditional
      // no-op proves it did not release the exact active owner, so inspect all
      // active rows instead of leaving an invalid SQLite checkpoint blocking
      // the next allocation.
      if (!quarantined) {
        await quarantineOrphanedActiveRecordingEvidenceSessions(
          profileId,
          validateStoredRecordingEvidenceCheckpoint,
        );
      }
    } else {
      await quarantineOrphanedActiveRecordingEvidenceSessions(
        profileId,
        validateStoredRecordingEvidenceCheckpoint,
      );
    }
  } catch {
    await quarantineOrphanedActiveRecordingEvidenceSessions(
      profileId,
      validateStoredRecordingEvidenceCheckpoint,
    );
  }
  await quarantine(raw, reason);
}

async function handleJournalCheckpointFailure(
  profileId: string,
  error: unknown,
): Promise<RecordingCheckpointRecovery> {
  const reason = error instanceof Error ? error.message : "Unreadable checkpoint";
  let mirror: string | null = null;
  try {
    mirror = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  } catch {}
  if (mirror) await quarantineRecoveredEvidence(mirror, profileId, reason);
  else {
    await quarantineOrphanedActiveRecordingEvidenceSessions(
      profileId,
      validateStoredRecordingEvidenceCheckpoint,
    );
    try {
      await AsyncStorage.removeItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
    } catch {}
  }
  return { status: "quarantined", reason };
}

function assertRecoveryJournal(checkpoint: RecordingCheckpoint): void {
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
  const compiled = compileActivityPlanV3(checkpoint.planSnapshot);
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
  let existingRaw = await loadRecordingEvidenceCheckpoint(parsed.profileId);
  if (!existingRaw) {
    try {
      existingRaw = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
    } catch {}
  }
  if (existingRaw) {
    const existing = activityRecorderCheckpointSchema.safeParse(JSON.parse(existingRaw));
    if (
      existing.success &&
      existing.data.sessionId === parsed.sessionId &&
      existing.data.revision >= parsed.revision
    ) {
      throw new Error("Recording checkpoint revision must increase monotonically");
    }
  }
  // Commit the authoritative copy before the compatibility mirror.
  await persistRecordingEvidenceCheckpoint({
    sessionId: parsed.sessionId,
    profileId: parsed.profileId,
    checkpoint: parsed,
  });
  try {
    await AsyncStorage.setItem(ACTIVE_RECORDING_CHECKPOINT_KEY, JSON.stringify(parsed));
  } catch {}
}

export type RecordingCheckpointRecovery =
  | { status: "none" }
  // Kept compatible with the existing provider boundary. The recorder narrows
  // the local discriminated schema before it accesses planned-only fields.
  | { status: "recovered"; checkpoint: RecordingCheckpoint }
  | { status: "quarantined"; reason: string };

export async function inspectRecordingCheckpoint(
  profileId: string,
): Promise<RecordingCheckpointRecovery> {
  let raw: string | null;
  try {
    raw = await loadRecordingEvidenceCheckpoint(profileId);
  } catch (error) {
    return handleJournalCheckpointFailure(profileId, error);
  }
  if (!raw) {
    try {
      raw = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
    } catch {}
  }
  if (!raw) return { status: "none" };
  try {
    return {
      status: "recovered",
      checkpoint: (await parseAndValidateCheckpoint(raw, profileId)) as RecordingCheckpoint,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unreadable checkpoint";
    await quarantineRecoveredEvidence(raw, profileId, reason);
    return { status: "quarantined", reason };
  }
}

export async function loadAndClaimRecordingCheckpoint(
  profileId: string,
): Promise<RecordingCheckpointRecovery> {
  let raw: string | null;
  try {
    raw = await loadRecordingEvidenceCheckpoint(profileId);
  } catch (error) {
    return handleJournalCheckpointFailure(profileId, error);
  }
  if (!raw) {
    try {
      raw = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
    } catch {}
  }
  if (!raw) return { status: "none" };
  if (claimedSessionId) return { status: "none" };
  try {
    const checkpoint = await parseAndValidateCheckpoint(raw, profileId);
    claimedSessionId = checkpoint.sessionId;
    return { status: "recovered", checkpoint: checkpoint as RecordingCheckpoint };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unreadable checkpoint";
    await quarantineRecoveredEvidence(raw, profileId, reason);
    return { status: "quarantined", reason };
  }
}

export async function quarantineActiveRecordingCheckpoint(
  reason: string,
  profileId?: string,
): Promise<void> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  } catch {}
  if (raw && profileId) await quarantineRecoveredEvidence(raw, profileId, reason);
  else if (raw) await quarantine(raw, reason);
  claimedSessionId = null;
}

export async function hasQuarantinedRecordingEvidence(): Promise<boolean> {
  return (await AsyncStorage.getItem(QUARANTINED_RECORDING_CHECKPOINT_KEY)) !== null;
}

export function releaseRecordingCheckpointClaim(sessionId: string): void {
  if (claimedSessionId === sessionId) claimedSessionId = null;
}

export async function clearRecordingCheckpoint(sessionId: string): Promise<void> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  } catch {}
  if (raw) {
    const parsed = activityRecorderCheckpointSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.sessionId !== sessionId) return;
  }
  // The SQLite finalization/queue handoff is already durable when callers use
  // this cleanup path. Compatibility mirror failures must not turn it into a
  // false finalization failure.
  try {
    await AsyncStorage.removeItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  } catch {}
  releaseRecordingCheckpointClaim(sessionId);
}
