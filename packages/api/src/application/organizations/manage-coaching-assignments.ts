import { createHash } from "node:crypto";
import type { DrizzleDbClient } from "@repo/db/client";
import { createCoachingAssignmentRepository } from "../../repositories/coaching-assignment-repository";

export class CoachingAssignmentError extends Error {
  constructor(readonly reason: "forbidden" | "not_found" | "conflict") {
    super(reason);
    this.name = "CoachingAssignmentError";
  }
}
type Kind = "primary" | "supporting";
type Command = {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  engagementId: string;
  operationId: string;
  expectedStateDigest: string;
  coachMembershipId?: string;
  assignmentKind?: Kind;
  assignmentId?: string;
  action: "assign" | "change" | "end";
};
const active = (value: { suspendedAt: Date | null; endedAt: Date | null } | null) =>
  value !== null && value.suspendedAt === null && value.endedAt === null;
const actionName = (action: Command["action"]) =>
  `organization.coaching_assignment_${action === "assign" ? "assigned" : action === "change" ? "changed" : "ended"}`;
/** Canonical bounded optimistic-concurrency token for the complete active set. */
export const coachingAssignmentStateDigest = (assignments: readonly { id: string }[]) =>
  createHash("sha256")
    .update(
      assignments
        .map((row) => row.id)
        .sort()
        .join(","),
    )
    .digest("hex");

export async function manageCoachingAssignment(input: Command) {
  return input.db.transaction(async (tx) => {
    const repo = createCoachingAssignmentRepository(tx);
    // This lock order intentionally matches staff suspension and role revocation:
    // organization, actor membership, then target lifecycle rows.
    const organization = await repo.lockOrganization(input.organizationId);
    if (!organization || organization.suspendedAt || organization.closedAt)
      throw new CoachingAssignmentError("forbidden");
    const actor = await repo.lockManager(input.organizationId, input.actorProfileId);
    if (!actor || !active(actor)) throw new CoachingAssignmentError("forbidden");
    const receipts = await repo.findReceipts(input.organizationId, input.operationId);
    const action = actionName(input.action);
    if (receipts.length > 0) {
      // Correlation IDs are command fences, not action-local identifiers.  The
      // current schema permits several action rows, so fail closed on all
      // ambiguity rather than selecting an arbitrary LIMIT 1 row.
      if (receipts.length !== 1) throw new CoachingAssignmentError("conflict");
      const replay = receipts[0];
      if (!replay) throw new CoachingAssignmentError("conflict");
      const details = replay.details as Record<string, unknown> | null;
      if (
        replay.action !== action ||
        replay.actorProfileId !== input.actorProfileId ||
        replay.actorMembershipId !== actor.id ||
        replay.resourceId !== input.engagementId ||
        details?.expected_state_digest !== input.expectedStateDigest ||
        details?.coach_membership_id !== (input.coachMembershipId ?? null) ||
        details?.assignment_kind !== (input.assignmentKind ?? null) ||
        details?.assignment_id !== (input.assignmentId ?? null)
      )
        throw new CoachingAssignmentError("conflict");
      return {
        engagementId: input.engagementId,
        operationId: input.operationId,
        status: input.action === "end" ? ("ended" as const) : ("assigned" as const),
      };
    }
    const engagement = await repo.lockEngagement(input.organizationId, input.engagementId);
    if (!engagement || engagement.endedAt || engagement.pausedAt)
      throw new CoachingAssignmentError("not_found");
    const assignments = await repo.lockAssignments(input.organizationId, input.engagementId);
    if (coachingAssignmentStateDigest(assignments) !== input.expectedStateDigest)
      throw new CoachingAssignmentError("conflict");
    let endedIds: string[] = [];
    const coachMembershipId = input.coachMembershipId;
    const assignmentKind = input.assignmentKind;
    if (input.action === "end") {
      if (!input.assignmentId || !assignments.some((row) => row.id === input.assignmentId))
        throw new CoachingAssignmentError("conflict");
      endedIds = [input.assignmentId];
    } else {
      if (!coachMembershipId || !assignmentKind) throw new CoachingAssignmentError("conflict");
      const coach = await repo.lockCoach(input.organizationId, coachMembershipId);
      if (
        !coach ||
        !active(coach) ||
        !(await repo.lockActiveCoachGrant(input.organizationId, coachMembershipId))
      )
        throw new CoachingAssignmentError("not_found");
      if (input.action === "change") {
        if (!input.assignmentId || !assignments.some((row) => row.id === input.assignmentId))
          throw new CoachingAssignmentError("conflict");
        endedIds.push(input.assignmentId);
      }
      if (assignmentKind === "primary")
        endedIds.push(
          ...assignments
            .filter((row) => row.assignmentKind === "primary" && row.id !== input.assignmentId)
            .map((row) => row.id),
        );
      if (
        assignments.some(
          (row) =>
            row.id !== input.assignmentId &&
            row.coachMembershipId === coachMembershipId &&
            row.assignmentKind === assignmentKind,
        )
      )
        throw new CoachingAssignmentError("conflict");
    }
    if (endedIds.length) await repo.endAssignments([...new Set(endedIds)]);
    let assignmentId: string | null = null;
    if (input.action !== "end") {
      if (!coachMembershipId || !assignmentKind) throw new CoachingAssignmentError("conflict");
      const inserted = await repo.insertAssignment({
        organizationId: input.organizationId,
        engagementId: input.engagementId,
        coachMembershipId,
        assignmentKind,
      });
      assignmentId = inserted[0]?.id ?? null;
      if (!assignmentId) throw new CoachingAssignmentError("conflict");
    }
    const recorded = await repo.recordReceipt({
      organizationId: input.organizationId,
      actorProfileId: input.actorProfileId,
      actorMembershipId: actor.id,
      engagementId: input.engagementId,
      operationId: input.operationId,
      action,
      details: {
        expected_state_digest: input.expectedStateDigest,
        coach_membership_id: input.coachMembershipId ?? null,
        assignment_kind: input.assignmentKind ?? null,
        assignment_id: input.assignmentId ?? null,
        result_assignment_id: assignmentId,
        ended_assignment_ids: [...new Set(endedIds)].sort(),
      },
    });
    if (!recorded[0]) throw new CoachingAssignmentError("conflict");
    return {
      engagementId: input.engagementId,
      operationId: input.operationId,
      status: input.action === "end" ? ("ended" as const) : ("assigned" as const),
    };
  });
}

export async function listCoachingAssignments(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  engagementId: string;
}) {
  return input.db.transaction(async (tx) => {
    const repo = createCoachingAssignmentRepository(tx);
    const organization = await repo.lockOrganization(input.organizationId);
    if (!organization || organization.suspendedAt || organization.closedAt)
      throw new CoachingAssignmentError("forbidden");
    const actor = await repo.lockManager(input.organizationId, input.actorProfileId);
    if (!actor || !active(actor)) throw new CoachingAssignmentError("forbidden");
    const engagement = await repo.lockEngagement(input.organizationId, input.engagementId);
    if (!engagement || engagement.endedAt) throw new CoachingAssignmentError("not_found");
    return repo.list(input.organizationId, input.engagementId);
  });
}
