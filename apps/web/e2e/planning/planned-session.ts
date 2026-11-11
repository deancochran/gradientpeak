import { plannedSessions } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import type { AuthenticatedE2EActor } from "../support/actors";
import { LocalE2EDatabase } from "../support/database";

/** Creates a fixture through the protected API so its prescription is server-resolved. */
export async function createDirectPlannedSessionFixture(input: {
  actor: AuthenticatedE2EActor;
  operationId: string;
  planningDate: string;
}) {
  const activityPlanId = input.actor.activityPlanId;
  if (!activityPlanId) throw new Error("The athlete activity-plan fixture was not provisioned.");
  const response = await input.actor.request.post("/api/trpc/plannedSessions.create?batch=1", {
    data: {
      0: {
        json: {
          profileId: input.actor.profileId,
          session: {
            activityPlanId,
            planningDate: input.planningDate,
            source: { kind: "direct", operationId: input.operationId },
          },
        },
      },
    },
  });
  if (!response.ok()) {
    const body = (await response.json()) as { error?: { json?: { message?: unknown } } }[];
    const message = body[0]?.error?.json?.message;
    throw new Error(
      `Direct planned-session fixture request failed with HTTP ${response.status()}: ${
        typeof message === "string" ? message : "unknown error"
      }`,
    );
  }

  const database = new LocalE2EDatabase();
  try {
    const session = await database.db
      .select({ id: plannedSessions.id })
      .from(plannedSessions)
      .where(
        and(
          eq(plannedSessions.profile_id, input.actor.profileId),
          eq(plannedSessions.idempotency_key, `direct:${input.operationId}`),
        ),
      )
      .limit(1);
    const id = session[0]?.id;
    if (!id) throw new Error("The server did not persist the direct planned-session fixture.");
    return id;
  } finally {
    await database.close();
  }
}
