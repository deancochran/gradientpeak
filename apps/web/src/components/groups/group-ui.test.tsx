import { describe, expect, it } from "vitest";
import { canRenderRemoveMemberControl } from "./group-ui";

describe("canRenderRemoveMemberControl", () => {
  it("keeps peer administrators from receiving an unavailable removal control", () => {
    const admin = { canRemoveMembers: true, relationshipState: "admin" as const };
    const owner = { canRemoveMembers: true, relationshipState: "owner" as const };

    expect(canRenderRemoveMemberControl(admin, "member")).toBe(true);
    expect(canRenderRemoveMemberControl(admin, "admin")).toBe(false);
    expect(canRenderRemoveMemberControl(owner, "admin")).toBe(true);
    expect(canRenderRemoveMemberControl(owner, "owner")).toBe(false);
  });
});
