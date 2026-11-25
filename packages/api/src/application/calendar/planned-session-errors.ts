import type { PlannedSession, PlannedSessionSource } from "@repo/core/calendar";
import type { PlannedSessionMutationResult } from "../../contracts/planned-sessions";

export class PlannedSessionAccessError extends Error {}

/** The caller is authorized, but the selected prescription needs actionable input. */
export class PlannedSessionPrescriptionPreconditionError extends Error {}

export class PlannedSessionIdentityConflictError extends Error {}

export class PlannedSessionNotFoundError extends Error {}

export class PlannedSessionStaleRevisionError extends Error {
  constructor(readonly currentRevision: number) {
    super("The planned session changed before this mutation was applied");
  }
}

export class PlannedSessionFutureDateError extends Error {
  constructor() {
    super("Future planned sessions cannot be skipped");
  }
}

export type PlannedSessionConflictReason = Extract<
  PlannedSessionMutationResult,
  { status: "conflict" }
>["reason"];

export class PlannedSessionStateConflictError extends Error {
  constructor(readonly reason: PlannedSessionConflictReason) {
    super(`The planned-session mutation conflicts with its current state: ${reason}`);
  }
}

export function requireUpdatedPlannedSession(result: PlannedSessionMutationResult): PlannedSession {
  switch (result.status) {
    case "updated":
      return result.session;
    case "not_found":
      throw new PlannedSessionNotFoundError("Planned session not found");
    case "access_denied":
      throw new PlannedSessionAccessError("The group event is unavailable to this profile");
    case "stale_revision":
      throw new PlannedSessionStaleRevisionError(result.currentRevision);
    case "conflict":
      throw new PlannedSessionStateConflictError(result.reason);
  }
}

export function sourceDescription(source: PlannedSessionSource): string {
  switch (source.kind) {
    case "direct":
      return source.operationId;
    case "training_plan":
      return `${source.trainingPlanId}:${source.trainingPlanRevision}:${source.sourceSessionId}`;
  }
}
