import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ grant: vi.fn(), revoke: vi.fn() }));

vi.mock("./staff-server-functions", () => ({
  grantOrganizationStaffRole: mocks.grant,
  revokeOrganizationStaffRole: mocks.revoke,
  loadOrganizationStaff: vi.fn(),
}));

import { submitOrganizationRoleCommand } from "./organization-roles-server-functions";

const command = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  membershipId: "22222222-2222-4222-8222-222222222222",
  operationId: "33333333-3333-4333-8333-333333333333",
  role: "coach" as const,
};

describe("organization role server function boundary", () => {
  it("forwards a frozen grant command without changing its operation id", async () => {
    mocks.grant.mockResolvedValue({ ...command, status: "granted" });

    await submitOrganizationRoleCommand({ ...command, mutation: "grant" });

    expect(mocks.grant).toHaveBeenCalledWith({ data: command });
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("routes a retrying revoke to the authoritative revoke function with the same payload", async () => {
    mocks.revoke.mockResolvedValue({ ...command, status: "revoked" });
    const frozen = { ...command, mutation: "revoke" as const };

    await submitOrganizationRoleCommand(frozen);
    await submitOrganizationRoleCommand(frozen);

    expect(mocks.revoke).toHaveBeenNthCalledWith(1, { data: command });
    expect(mocks.revoke).toHaveBeenNthCalledWith(2, { data: command });
  });
});
