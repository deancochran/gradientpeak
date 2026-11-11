import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const inputSchema = z
  .object({
    athleteProfileId: z.string().uuid(),
    cursor: z.string().min(1).max(64).nullable(),
    organizationId: z.string().uuid(),
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
  return appRouter.createCaller(
    await createApiContext({
      headers,
      auth: { session: await resolveAuthSessionFromHeaders(headers) },
      db,
    }),
  );
}

function access(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED"].includes(String((error as { code?: unknown }).code))
  );
}

/** Request authentication binds the actor; callers only select their organization, athlete, and opaque continuation. */
export const loadCoachAthleteGoals = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return {
        status: "granted" as const,
        ...(await (await caller()).goals.listForOrganization({ ...data, limit: 20 })),
      };
    } catch (error) {
      if (access(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export function parseCoachAthleteGoalsInput(input: unknown) {
  return inputSchema.parse(input);
}
