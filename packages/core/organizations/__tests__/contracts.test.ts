import { describe, expect, it } from "vitest";

import {
  COACHING_ACCESS_PERMISSION,
  organizationCapabilityCheckSchema,
  organizationMembershipStatusSchema,
  organizationPermissionSchema,
  organizationRoleGrantStatusSchema,
} from "../index";

describe("organization authorization contracts", () => {
  it("accepts the controlled coaching access capability", () => {
    expect(organizationPermissionSchema.parse(COACHING_ACCESS_PERMISSION)).toBe("coaching.access");
    expect(
      organizationCapabilityCheckSchema.parse({
        organizationId: "11111111-1111-4111-8111-111111111111",
        profileId: "22222222-2222-4222-8222-222222222222",
        permission: COACHING_ACCESS_PERMISSION,
      }),
    ).toEqual({
      organizationId: "11111111-1111-4111-8111-111111111111",
      profileId: "22222222-2222-4222-8222-222222222222",
      permission: "coaching.access",
    });
  });

  it("rejects unregistered capabilities and malformed identifiers", () => {
    expect(organizationPermissionSchema.safeParse("athlete.read").success).toBe(false);
    expect(
      organizationCapabilityCheckSchema.safeParse({
        organizationId: "not-an-organization-id",
        profileId: "22222222-2222-4222-8222-222222222222",
        permission: COACHING_ACCESS_PERMISSION,
      }).success,
    ).toBe(false);
  });

  it("keeps membership and role-grant lifecycle states closed", () => {
    expect(organizationMembershipStatusSchema.safeParse("active").success).toBe(true);
    expect(organizationMembershipStatusSchema.safeParse("removed").success).toBe(false);
    expect(organizationRoleGrantStatusSchema.safeParse("inactive").success).toBe(true);
    expect(organizationRoleGrantStatusSchema.safeParse("revoked").success).toBe(false);
  });
});
