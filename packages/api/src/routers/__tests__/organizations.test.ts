import { COACHING_ACCESS_PERMISSION } from "@repo/core/organizations";
import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationAccessRepository } from "../../repositories/organization-access-repository";
import { createRouterCaller } from "../../test/router";
import { createOrganizationsRouter } from "../organizations";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROFILE_ID = "33333333-3333-4333-8333-333333333333";

function createHarness(
  result: Awaited<ReturnType<OrganizationAccessRepository["findOrganizationWithCapability"]>>,
) {
  const findOrganizationWithCapability = vi.fn(async () => result);
  const getAccessRepository = vi.fn(() => ({ findOrganizationWithCapability }));
  const router = createOrganizationsRouter({ getAccessRepository });

  return { findOrganizationWithCapability, getAccessRepository, router };
}

describe("organizationsRouter.coachingAccess", () => {
  it("denies unauthenticated callers before accessing persistence", async () => {
    const harness = createHarness(null);
    const caller = createRouterCaller(harness.router, { session: null });

    await expect(caller.coachingAccess({ organizationId: ORGANIZATION_ID })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    } satisfies Partial<TRPCError>);
    expect(harness.getAccessRepository).not.toHaveBeenCalled();
  });

  it("denies malformed and non-strict client input", async () => {
    const harness = createHarness(null);
    const caller = createRouterCaller(harness.router, { userId: SESSION_PROFILE_ID });

    await expect(caller.coachingAccess({ organizationId: "not-a-uuid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
    const unsafeInput: unknown = {
      organizationId: ORGANIZATION_ID,
      profileId: OTHER_PROFILE_ID,
      permission: COACHING_ACCESS_PERMISSION,
    };
    await expect(
      caller.coachingAccess(unsafeInput as { organizationId: string }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    expect(harness.getAccessRepository).not.toHaveBeenCalled();
  });

  it("binds the profile and permission server-side and returns only safe organization identity", async () => {
    const harness = createHarness({
      id: ORGANIZATION_ID,
      name: "Peak Coaching",
      slug: "peak-coaching",
    });
    const caller = createRouterCaller(harness.router, { userId: SESSION_PROFILE_ID });

    await expect(caller.coachingAccess({ organizationId: ORGANIZATION_ID })).resolves.toEqual({
      status: "granted",
      organization: {
        id: ORGANIZATION_ID,
        name: "Peak Coaching",
        slug: "peak-coaching",
      },
    });
    expect(harness.findOrganizationWithCapability).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      profileId: SESSION_PROFILE_ID,
      permission: COACHING_ACCESS_PERMISSION,
    });
  });

  it("returns the narrow forbidden result when no effective grant exists", async () => {
    const harness = createHarness(null);
    const caller = createRouterCaller(harness.router, { userId: SESSION_PROFILE_ID });

    await expect(caller.coachingAccess({ organizationId: ORGANIZATION_ID })).resolves.toEqual({
      status: "forbidden",
    });
  });
});
