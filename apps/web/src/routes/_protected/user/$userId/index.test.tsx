import { describe, expect, it } from "vitest";
import { isNotFoundError } from "../../../../components/protected/profile-query-state";

describe("profile query failures", () => {
  it("maps only a typed NOT_FOUND response to the missing-profile state", () => {
    expect(isNotFoundError({ data: { code: "NOT_FOUND" } })).toBe(true);
    expect(isNotFoundError({ data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(false);
    expect(isNotFoundError(new Error("network unavailable"))).toBe(false);
  });
});
