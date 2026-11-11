import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const ids = z
  .object({ organizationId: z.string().uuid(), engagementId: z.string().uuid() })
  .strict();
const candidatePage = z
  .object({
    organizationId: z.string().uuid(),
    limit: z.number().int().min(1).max(50),
    cursor: z.string().uuid().nullable(),
  })
  .strict();
const command = ids.extend({
  operationId: z.string().uuid(),
  expectedStateDigest: z.string().regex(/^[a-f0-9]{64}$/),
});
const assignInput = command
  .extend({
    coachMembershipId: z.string().uuid(),
    assignmentKind: z.enum(["primary", "supporting"]),
  })
  .strict();
const changeInput = assignInput.extend({ assignmentId: z.string().uuid() }).strict();
const endInput = command.extend({ assignmentId: z.string().uuid() }).strict();

async function caller() {
  const [{ appRouter, createApiContext }, { resolveAuthSessionFromHeaders }, { db }] =
    await Promise.all([
      import("@repo/api/server"),
      import("@repo/auth/server"),
      import("@repo/db/client"),
    ]);
  const headers = getRequestHeaders();
  const session = await resolveAuthSessionFromHeaders(headers);
  return appRouter.createCaller(await createApiContext({ headers, auth: { session }, db }));
}
function isAccessError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return code === "FORBIDDEN" || code === "NOT_FOUND" || code === "UNAUTHORIZED";
}
function candidates(staff: {
  items: Array<{
    membershipId: string;
    roleKeys: string[];
    identity: { displayName: string | null; username: string | null };
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}) {
  return {
    items: staff.items
      .filter((member) => member.roleKeys.includes("coach"))
      .map((member) => ({
        membershipId: member.membershipId,
        label: member.identity.displayName ?? member.identity.username ?? "Organization coach",
      })),
    nextCursor: staff.nextCursor,
    hasMore: staff.hasMore,
  };
}

/** Request-bound administrative read: assignments and selectable coaches are separately authoritative. */
export const loadOrganizationCoachingAssignments = createServerFn({ method: "POST" })
  .validator((input: unknown) => ids.parse(input))
  .handler(async ({ data }) => {
    try {
      const api = await caller();
      const [assignments, staff] = await Promise.all([
        api.organizations.coachingAssignments.list(data),
        api.organizations.lifecycle.staff.list({
          organizationId: data.organizationId,
          status: "active",
          limit: 50,
          cursor: null,
        }),
      ]);
      return { status: "granted" as const, assignments, candidates: candidates(staff) };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });
export const loadOrganizationCoachingAssignmentCandidates = createServerFn({ method: "POST" })
  .validator((input: unknown) => candidatePage.parse(input))
  .handler(async ({ data }) => {
    try {
      return {
        status: "granted" as const,
        page: candidates(
          await (await caller()).organizations.lifecycle.staff.list({ ...data, status: "active" }),
        ),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });
export const assignOrganizationCoach = createServerFn({ method: "POST" })
  .validator((input: unknown) => assignInput.parse(input))
  .handler(async ({ data }) => {
    try {
      return await (await caller()).organizations.coachingAssignments.assign(data);
    } catch (error) {
      if (isAccessError(error)) return { status: "access_lost" as const };
      throw error;
    }
  });
export const changeOrganizationCoach = createServerFn({ method: "POST" })
  .validator((input: unknown) => changeInput.parse(input))
  .handler(async ({ data }) => {
    try {
      return await (await caller()).organizations.coachingAssignments.change(data);
    } catch (error) {
      if (isAccessError(error)) return { status: "access_lost" as const };
      throw error;
    }
  });
export const endOrganizationCoachAssignment = createServerFn({ method: "POST" })
  .validator((input: unknown) => endInput.parse(input))
  .handler(async ({ data }) => {
    try {
      return await (await caller()).organizations.coachingAssignments.end(data);
    } catch (error) {
      if (isAccessError(error)) return { status: "access_lost" as const };
      throw error;
    }
  });
