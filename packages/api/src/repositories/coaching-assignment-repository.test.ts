import { describe, expect, it } from "vitest";
import { createCoachingAssignmentRepository } from "./coaching-assignment-repository";

describe("coaching assignment repository", () => {
  it("exposes a deliberately narrow persistence surface", () => {
    const repository = createCoachingAssignmentRepository({} as never);
    expect(Object.keys(repository).sort()).toEqual([
      "endAssignments",
      "findReceipts",
      "insertAssignment",
      "list",
      "lockActiveCoachGrant",
      "lockAssignments",
      "lockCoach",
      "lockEngagement",
      "lockManager",
      "lockOrganization",
      "recordReceipt",
    ]);
  });
});
