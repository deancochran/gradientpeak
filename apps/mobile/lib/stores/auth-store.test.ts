import { describe, expectTypeOf, it } from "vitest";
import type { AuthProfile, AuthState } from "./auth-store";

describe("auth store profile contract", () => {
  it("uses the profiles.get output including nullable fields", () => {
    expectTypeOf<AuthState["profile"]>().toEqualTypeOf<AuthProfile | null>();
    expectTypeOf<AuthState["setProfile"]>().parameter(0).toEqualTypeOf<AuthProfile | null>();
    expectTypeOf<AuthProfile["bio"]>().toEqualTypeOf<string | null>();
    expectTypeOf<AuthProfile["dob"]>().toEqualTypeOf<string | null>();

    const assertRejectedShapes = () => {
      const profile = null as unknown as AuthProfile;
      const setProfile = null as unknown as AuthState["setProfile"];

      // @ts-expect-error Social response fields are not part of profiles.get.
      void profile.followers_count;
      // @ts-expect-error Partial or stale profile DTOs cannot enter auth state.
      setProfile({ id: "profile-1", onboarded: true });
    };
    void assertRejectedShapes;
  });
});
