import type {
  RecordingControlPolicy,
  RecordingTrainerControlIntent,
  RecordingTrainerIntentSource,
} from "../schemas/recording-session";

export const recordingTrainerIntentPrecedence = [
  "manual",
  "reconnect_recovery",
  "step_change",
  "periodic_refinement",
] as const satisfies readonly RecordingTrainerIntentSource[];

export interface RecordingTrainerIntentCandidate {
  intent: RecordingTrainerControlIntent;
  createdAt?: string | null;
}

export interface SelectWinningTrainerIntentParams {
  trainerMode: RecordingControlPolicy["trainerMode"];
  candidates: readonly RecordingTrainerIntentCandidate[];
}

const precedenceOrder = new Map(
  recordingTrainerIntentPrecedence.map((source, index) => [source, index]),
);

function getIntentPrecedence(source: RecordingTrainerIntentSource): number {
  return precedenceOrder.get(source) ?? Number.MAX_SAFE_INTEGER;
}

function getCreatedAtOrder(createdAt?: string | null): number {
  if (!createdAt) {
    return Number.MIN_SAFE_INTEGER;
  }

  const value = Date.parse(createdAt);
  return Number.isFinite(value) ? value : Number.MIN_SAFE_INTEGER;
}

export function compareTrainerIntentPriority(
  left: RecordingTrainerIntentCandidate,
  right: RecordingTrainerIntentCandidate,
): number {
  const precedenceDelta =
    getIntentPrecedence(left.intent.source) - getIntentPrecedence(right.intent.source);

  if (precedenceDelta !== 0) {
    return precedenceDelta;
  }

  return getCreatedAtOrder(right.createdAt) - getCreatedAtOrder(left.createdAt);
}

export function selectWinningTrainerIntent(
  params: SelectWinningTrainerIntentParams,
): RecordingTrainerIntentCandidate | null {
  const { candidates, trainerMode } = params;

  if (candidates.length === 0) {
    return null;
  }

  const allowedCandidates =
    trainerMode === "manual"
      ? candidates.filter((candidate) => candidate.intent.source === "manual")
      : [...candidates];

  if (allowedCandidates.length === 0) {
    return null;
  }

  return [...allowedCandidates].sort(compareTrainerIntentPriority)[0] ?? null;
}

export function canTrainerIntentPreempt(
  nextSource: RecordingTrainerIntentSource,
  currentSource: RecordingTrainerIntentSource,
): boolean {
  return getIntentPrecedence(nextSource) <= getIntentPrecedence(currentSource);
}
