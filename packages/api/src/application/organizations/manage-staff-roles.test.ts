import { describe, expect, it } from "vitest";
import { canManageStaffRole } from "./manage-staff-roles";

const ROOT = "root";
const ADMIN = "admin";
const COACH = "coach";
const OTHER = "other";

describe("canManageStaffRole", () => {
  it("lets only the root owner manage admin grants", () => {
    expect(
      canManageStaffRole({
        role: "admin",
        mutation: "grant",
        actorMembershipId: ROOT,
        rootMembershipId: ROOT,
        actorRoles: ["admin"],
        targetMembershipId: OTHER,
      }),
    ).toBe(true);
    expect(
      canManageStaffRole({
        role: "admin",
        mutation: "grant",
        actorMembershipId: ADMIN,
        rootMembershipId: ROOT,
        actorRoles: ["admin"],
        targetMembershipId: OTHER,
      }),
    ).toBe(false);
  });

  it("lets root owners and current admins manage coach grants", () => {
    for (const [actorMembershipId, actorRoles] of [
      [ROOT, ["admin"]],
      [ADMIN, ["admin"]],
    ] as const) {
      expect(
        canManageStaffRole({
          role: "coach",
          mutation: "grant",
          actorMembershipId,
          rootMembershipId: ROOT,
          actorRoles,
          targetMembershipId: COACH,
        }),
      ).toBe(true);
    }
    expect(
      canManageStaffRole({
        role: "coach",
        mutation: "grant",
        actorMembershipId: COACH,
        rootMembershipId: ROOT,
        actorRoles: ["coach"],
        targetMembershipId: OTHER,
      }),
    ).toBe(false);
  });

  it("allows active root owners and admins to grant themselves coach without allowing self-revokes", () => {
    for (const [actorMembershipId, actorRoles] of [
      [ROOT, ["admin"]],
      [ADMIN, ["admin"]],
    ] as const) {
      expect(
        canManageStaffRole({
          role: "coach",
          mutation: "grant",
          actorMembershipId,
          rootMembershipId: ROOT,
          actorRoles,
          targetMembershipId: actorMembershipId,
        }),
      ).toBe(true);
      expect(
        canManageStaffRole({
          role: "coach",
          mutation: "revoke",
          actorMembershipId,
          rootMembershipId: ROOT,
          actorRoles,
          targetMembershipId: actorMembershipId,
        }),
      ).toBe(false);
    }
  });

  it("protects root membership from other actors and denies self-admin escalation", () => {
    expect(
      canManageStaffRole({
        role: "admin",
        mutation: "grant",
        actorMembershipId: ADMIN,
        rootMembershipId: ROOT,
        actorRoles: ["admin"],
        targetMembershipId: ADMIN,
      }),
    ).toBe(false);
    expect(
      canManageStaffRole({
        role: "coach",
        mutation: "grant",
        actorMembershipId: ADMIN,
        rootMembershipId: ROOT,
        actorRoles: ["admin"],
        targetMembershipId: ROOT,
      }),
    ).toBe(false);
  });
});
