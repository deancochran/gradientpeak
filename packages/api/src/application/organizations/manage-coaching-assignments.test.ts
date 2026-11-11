import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = {
  lockOrganization: vi.fn(),
  lockManager: vi.fn(),
  lockEngagement: vi.fn(),
  lockCoach: vi.fn(),
  lockActiveCoachGrant: vi.fn(),
  lockAssignments: vi.fn(),
  findReceipts: vi.fn(),
  endAssignments: vi.fn(),
  insertAssignment: vi.fn(),
  recordReceipt: vi.fn(),
  list: vi.fn(),
};
vi.mock("../../repositories/coaching-assignment-repository", () => ({
  createCoachingAssignmentRepository: () => repository,
}));

import {
  CoachingAssignmentError,
  coachingAssignmentStateDigest,
  listCoachingAssignments,
  manageCoachingAssignment,
} from "./manage-coaching-assignments";

const ids = {
  org: "00000000-0000-4000-8000-000000000001",
  actor: "00000000-0000-4000-8000-000000000002",
  engagement: "00000000-0000-4000-8000-000000000003",
  coach: "00000000-0000-4000-8000-000000000004",
  operation: "00000000-0000-4000-8000-000000000005",
};
const command = (overrides = {}) => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } as never,
  actorProfileId: ids.actor,
  organizationId: ids.org,
  engagementId: ids.engagement,
  operationId: ids.operation,
  expectedStateDigest: coachingAssignmentStateDigest([]),
  coachMembershipId: ids.coach,
  assignmentKind: "primary" as const,
  action: "assign" as const,
  ...overrides,
});
describe("manageCoachingAssignment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.lockOrganization.mockResolvedValue({ suspendedAt: null, closedAt: null });
    repository.lockManager.mockResolvedValue({ id: "manager", suspendedAt: null, endedAt: null });
    repository.lockEngagement.mockResolvedValue({
      id: ids.engagement,
      pausedAt: null,
      endedAt: null,
    });
    repository.lockCoach.mockResolvedValue({
      id: ids.coach,
      suspendedAt: null,
      endedAt: null,
    });
    repository.lockActiveCoachGrant.mockResolvedValue({ id: "grant" });
    repository.lockAssignments.mockResolvedValue([]);
    repository.findReceipts.mockResolvedValue([]);
    repository.insertAssignment.mockResolvedValue([{ id: "assignment" }]);
    repository.recordReceipt.mockResolvedValue([{ id: "receipt" }]);
  });
  it("ends the current primary before atomically inserting its replacement", async () => {
    repository.lockAssignments.mockResolvedValue([
      { id: "old", coachMembershipId: "old-coach", assignmentKind: "primary" },
    ]);
    await manageCoachingAssignment(
      command({ expectedStateDigest: coachingAssignmentStateDigest([{ id: "old" }]) }),
    );
    expect(repository.endAssignments).toHaveBeenCalledWith(["old"]);
    expect(repository.insertAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ assignmentKind: "primary" }),
    );
  });
  it("rejects stale expected assignment state before a write", async () => {
    repository.lockAssignments.mockResolvedValue([
      { id: "newer", coachMembershipId: ids.coach, assignmentKind: "supporting" },
    ]);
    await expect(manageCoachingAssignment(command())).rejects.toMatchObject({ reason: "conflict" });
    expect(repository.insertAssignment).not.toHaveBeenCalled();
  });
  it("requires current authority before replaying a durable receipt", async () => {
    repository.lockManager.mockResolvedValue({
      id: "manager",
      suspendedAt: new Date(),
      endedAt: null,
    });
    repository.findReceipts.mockResolvedValue([
      { action: "organization.coaching_assignment_assigned" },
    ]);
    await expect(manageCoachingAssignment(command())).rejects.toBeInstanceOf(
      CoachingAssignmentError,
    );
    expect(repository.findReceipts).not.toHaveBeenCalled();
  });
  it("returns the bounded assigned-coach identity and makes a non-active membership explicit", async () => {
    repository.list.mockResolvedValue([
      {
        id: "assignment",
        coachMembershipId: ids.coach,
        assignmentKind: "primary",
        assignedAt: new Date("2026-11-08T00:00:00.000Z"),
        coachDisplayName: "Coach Fifty One",
        coachUsername: "coach-51",
        coachSuspendedAt: new Date("2026-11-08T01:00:00.000Z"),
        coachEndedAt: null,
      },
    ]);
    await expect(
      listCoachingAssignments({
        db: command().db,
        actorProfileId: ids.actor,
        organizationId: ids.org,
        engagementId: ids.engagement,
      }),
    ).resolves.toMatchObject([
      {
        coachMembershipId: ids.coach,
        coachIdentity: {
          displayName: "Coach Fifty One",
          username: "coach-51",
          membershipStatus: "suspended",
        },
      },
    ]);
  });
  it("replays only the exact semantic command", async () => {
    repository.findReceipts.mockResolvedValue([
      {
        action: "organization.coaching_assignment_assigned",
        actorProfileId: ids.actor,
        actorMembershipId: "manager",
        resourceId: ids.engagement,
        details: {
          expected_state_digest: coachingAssignmentStateDigest([]),
          coach_membership_id: ids.coach,
          assignment_kind: "primary",
          assignment_id: null,
        },
      },
    ]);
    await expect(manageCoachingAssignment(command())).resolves.toMatchObject({
      status: "assigned",
    });
    await expect(
      manageCoachingAssignment(command({ assignmentKind: "supporting" })),
    ).rejects.toMatchObject({ reason: "conflict" });
    expect(repository.lockEngagement).not.toHaveBeenCalled();
  });
  it("rejects an operation ID with more than one audit action", async () => {
    repository.findReceipts.mockResolvedValue([
      { action: "organization.coaching_assignment_assigned" },
      { action: "different_action" },
    ]);
    await expect(manageCoachingAssignment(command())).rejects.toMatchObject({ reason: "conflict" });
    expect(repository.lockEngagement).not.toHaveBeenCalled();
  });
});
