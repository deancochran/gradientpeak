import { describe, expect, it } from "vitest";

import {
  canContentRowSatisfyRead,
  createContentAccessPermissions,
  needsContentGrantForRow,
} from "./content-access";

describe("content access row helpers", () => {
  it("allows rows that are owned, public, or system without a grant", () => {
    expect(canContentRowSatisfyRead({ ownerProfileId: "profile-1" }, "profile-1")).toBe(true);
    expect(
      canContentRowSatisfyRead({ ownerProfileId: "profile-2", isPublic: true }, "profile-1"),
    ).toBe(true);
    expect(
      canContentRowSatisfyRead({ ownerProfileId: "profile-2", isSystem: true }, "profile-1"),
    ).toBe(true);
  });

  it("requires a grant for private rows owned by another profile", () => {
    const row = { ownerProfileId: "profile-2", isPublic: false, isSystem: false };

    expect(canContentRowSatisfyRead(row, "profile-1")).toBe(false);
    expect(needsContentGrantForRow(row, "profile-1")).toBe(true);
  });

  it("does not request grants when row access metadata is unavailable", () => {
    expect(needsContentGrantForRow({}, "profile-1")).toBe(false);
  });

  it("filters readable rows without grant lookups for row-readable content", async () => {
    const permissions = createContentAccessPermissions({} as any);
    const rows = [
      { id: "owned", ownerProfileId: "profile-1" },
      { id: "public", ownerProfileId: "profile-2", isPublic: true },
      { id: "system", ownerProfileId: null, isSystem: true },
    ];

    await expect(
      permissions.filterReadableRows({
        actorProfileId: "profile-1",
        rows,
        getRowInput: (row) => ({
          row,
          resource: { type: "activity_plan", id: row.id },
          access: row,
        }),
      }),
    ).resolves.toEqual(rows);
  });

  it("does not treat geometry-only grants as full read grants", async () => {
    const selectResults = [
      [{ id: "route-1", ownerProfileId: "profile-2", isPublic: false, isSystem: false }],
      [],
      [{ id: "route-1", ownerProfileId: "profile-2", isPublic: false, isSystem: false }],
      [{ accessLevel: "read_geometry", sourceType: "event", sourceId: "event-1" }],
    ];
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: async () => selectResults.shift() ?? [],
    };
    const db = { select: () => builder } as any;
    const permissions = createContentAccessPermissions(db);

    await expect(
      permissions.canRead("profile-1", { type: "activity_route", id: "route-1" }),
    ).resolves.toMatchObject({ allowed: false });
    await expect(permissions.requireRouteGeometry("profile-1", "route-1")).resolves.toMatchObject({
      allowed: true,
      reason: "grant",
    });
  });
});
