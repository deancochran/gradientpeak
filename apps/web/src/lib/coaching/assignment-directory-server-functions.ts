import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const inputSchema = z
  .object({
    organizationId: z.string().uuid(),
    limit: z.number().int().min(1).max(50),
    cursor: z.string().uuid().nullable(),
  })
  .strict();

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

/**
 * Request-bound admin directory. Every constituent read is authorization checked by its
 * authoritative API procedure; coach identity is returned by the authorized assignment read.
 */
export const loadOrganizationAssignmentDirectory = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const api = await caller();
      const roster = await api.organizations.lifecycle.adminRoster.list(data);
      const assignments = await Promise.all(
        roster.items.map(async (athlete) => ({
          engagementId: athlete.engagementId,
          items: (
            await api.organizations.coachingAssignments.list({
              organizationId: data.organizationId,
              engagementId: athlete.engagementId,
            })
          ).items.map((assignment) => ({
            ...assignment,
            coachName:
              assignment.coachIdentity.displayName ??
              assignment.coachIdentity.username ??
              "Unnamed organization coach",
          })),
        })),
      );
      const assignmentsByEngagement = new Map(
        assignments.map((item) => [item.engagementId, item.items]),
      );
      return {
        status: "granted" as const,
        ...roster,
        items: roster.items.map((athlete) => ({
          ...athlete,
          assignments: assignmentsByEngagement.get(athlete.engagementId) ?? [],
        })),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });
