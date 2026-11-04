import { beforeEach, describe, expect, it, vi } from "vitest";

type RepositoryMock = {
  getCurrentAdministrativeAuthority: ReturnType<typeof vi.fn>;
  staffCursorBelongsToOrganization: ReturnType<typeof vi.fn>;
  listCurrentStaff: ReturnType<typeof vi.fn>;
};
const state = vi.hoisted(() => ({ repository: {} as RepositoryMock }));
vi.mock("../../repositories/organization-lifecycle-repository", () => ({
  createOrganizationLifecycleRepository: () => state.repository,
}));

import { listOrganizationStaff } from "./manage-organization-lifecycle";

const ids = {
  actor: "00000000-0000-4000-8000-000000000001",
  organization: "00000000-0000-4000-8000-000000000002",
  membership: "00000000-0000-4000-8000-000000000003",
};

describe("organization staff discovery", () => {
  beforeEach(() => {
    state.repository = {
      getCurrentAdministrativeAuthority: vi.fn().mockResolvedValue({
        membershipId: ids.actor,
        isRootOwner: true,
      }),
      staffCursorBelongsToOrganization: vi.fn().mockResolvedValue(true),
      listCurrentStaff: vi.fn().mockResolvedValue([
        {
          membershipId: ids.membership,
          isRootOwner: false,
          profileId: ids.membership,
          displayName: "Suspended coach",
          username: "suspended-coach",
          roleKeys: ["coach"],
          suspendedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]),
    };
  });

  it("passes the explicit lifecycle filter through the cursor fence and bounded query", async () => {
    const result = await listOrganizationStaff({
      db: {} as never,
      actorProfileId: ids.actor,
      organizationId: ids.organization,
      limit: 1,
      cursor: ids.membership,
      status: "suspended",
    });
    expect(state.repository.staffCursorBelongsToOrganization).toHaveBeenCalledWith(
      ids.organization,
      ids.membership,
      "suspended",
    );
    expect(state.repository.listCurrentStaff).toHaveBeenCalledWith(
      ids.organization,
      1,
      ids.membership,
      "suspended",
    );
    expect(result.items[0]).toMatchObject({
      membershipId: ids.membership,
      suspendedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("rejects a cursor from a different lifecycle filter", async () => {
    state.repository.staffCursorBelongsToOrganization.mockResolvedValue(false);
    await expect(
      listOrganizationStaff({
        db: {} as never,
        actorProfileId: ids.actor,
        organizationId: ids.organization,
        limit: 1,
        cursor: ids.membership,
        status: "active",
      }),
    ).rejects.toMatchObject({ reason: "invalid_cursor" });
  });

  it("does not authorize a suspended administrator", async () => {
    state.repository.getCurrentAdministrativeAuthority.mockResolvedValue(null);
    await expect(
      listOrganizationStaff({
        db: {} as never,
        actorProfileId: ids.actor,
        organizationId: ids.organization,
        limit: 1,
        cursor: null,
        status: "suspended",
      }),
    ).rejects.toMatchObject({ reason: "forbidden" });
  });
});
