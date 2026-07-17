import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ACTIVITY_PLAN_COMPILER_VERSION,
  activityPlanStructureSchemaV3,
  compileActivityPlanV3,
  type RecordingCheckpoint,
  recordingCheckpointSchema,
} from "@repo/core";

export const ACTIVE_RECORDING_CHECKPOINT_KEY = "activity-recorder:v3:active-checkpoint";
export const QUARANTINED_RECORDING_CHECKPOINT_KEY = "activity-recorder:v3:quarantined-checkpoint";
let claimedSessionId: string | null = null;

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
  await AsyncStorage.setItem(
    QUARANTINED_RECORDING_CHECKPOINT_KEY,
    JSON.stringify({ quarantinedAt: new Date().toISOString(), reason, raw }),
  );
  await AsyncStorage.removeItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
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
): Promise<RecordingCheckpoint> {
  const checkpoint = recordingCheckpointSchema.parse(JSON.parse(raw));
  if (checkpoint.profileId !== profileId) throw new Error("Checkpoint profile does not match");
  if (checkpoint.compilerVersion !== ACTIVITY_PLAN_COMPILER_VERSION) {
    throw new Error("Checkpoint compiler version is unsupported");
  }
  if ((await hashRecordingPlan(checkpoint.planSnapshot)) !== checkpoint.planHash) {
    throw new Error("Checkpoint plan hash does not match its snapshot");
  }
  assertRecoveryJournal(checkpoint);
  return checkpoint;
}

export async function persistRecordingCheckpoint(checkpoint: RecordingCheckpoint): Promise<void> {
  const parsed = recordingCheckpointSchema.parse(checkpoint);
  const existingRaw = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  if (existingRaw) {
    const existing = recordingCheckpointSchema.safeParse(JSON.parse(existingRaw));
    if (
      existing.success &&
      existing.data.sessionId === parsed.sessionId &&
      existing.data.revision >= parsed.revision
    ) {
      throw new Error("Recording checkpoint revision must increase monotonically");
    }
  }
  await AsyncStorage.setItem(ACTIVE_RECORDING_CHECKPOINT_KEY, JSON.stringify(parsed));
}

export type RecordingCheckpointRecovery =
  | { status: "none" }
  | { status: "recovered"; checkpoint: RecordingCheckpoint }
  | { status: "quarantined"; reason: string };

export async function inspectRecordingCheckpoint(
  profileId: string,
): Promise<RecordingCheckpointRecovery> {
  const raw = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  if (!raw) return { status: "none" };
  try {
    return { status: "recovered", checkpoint: await parseAndValidateCheckpoint(raw, profileId) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unreadable checkpoint";
    await quarantine(raw, reason);
    return { status: "quarantined", reason };
  }
}

export async function loadAndClaimRecordingCheckpoint(
  profileId: string,
): Promise<RecordingCheckpointRecovery> {
  const raw = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  if (!raw) return { status: "none" };
  if (claimedSessionId) return { status: "none" };
  try {
    const checkpoint = await parseAndValidateCheckpoint(raw, profileId);
    claimedSessionId = checkpoint.sessionId;
    return { status: "recovered", checkpoint };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unreadable checkpoint";
    await quarantine(raw, reason);
    return { status: "quarantined", reason };
  }
}

export async function quarantineActiveRecordingCheckpoint(reason: string): Promise<void> {
  const raw = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  if (raw) await quarantine(raw, reason);
  claimedSessionId = null;
}

export async function hasQuarantinedRecordingEvidence(): Promise<boolean> {
  return (await AsyncStorage.getItem(QUARANTINED_RECORDING_CHECKPOINT_KEY)) !== null;
}

export function releaseRecordingCheckpointClaim(sessionId: string): void {
  if (claimedSessionId === sessionId) claimedSessionId = null;
}

export async function clearRecordingCheckpoint(sessionId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  if (raw) {
    const parsed = recordingCheckpointSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.sessionId !== sessionId) return;
  }
  await AsyncStorage.removeItem(ACTIVE_RECORDING_CHECKPOINT_KEY);
  releaseRecordingCheckpointClaim(sessionId);
}
