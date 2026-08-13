import { type DrizzleDbClient, schema } from "@repo/db";
import { and, eq } from "drizzle-orm";

export function createActivityPlanWriteRepository(db: DrizzleDbClient) {
  return {
    async deleteOwnedPlanIfUnlinked(input: {
      planId: string;
      profileId: string;
    }): Promise<"deleted" | "linked_events" | "not_found"> {
      return db.transaction(async (tx) => {
        const planQuery = tx
          .select({ id: schema.activityPlans.id })
          .from(schema.activityPlans)
          .where(
            and(
              eq(schema.activityPlans.id, input.planId),
              eq(schema.activityPlans.profile_id, input.profileId),
            ),
          )
          .limit(1);
        const lockablePlanQuery = planQuery as typeof planQuery & {
          for?: (strength: "update") => typeof planQuery;
        };
        const [plan] = await (lockablePlanQuery.for ? lockablePlanQuery.for("update") : planQuery);
        if (!plan) return "not_found";

        // The plan row lock fences concurrent FK references. Existence reads
        // handle any number of linked schedules without a UI page limit and
        // leave every dependency intact on conflict.
        const [linkedEvent] = await tx
          .select({ id: schema.events.id })
          .from(schema.events)
          .where(eq(schema.events.activity_plan_id, input.planId))
          .limit(1);
        if (linkedEvent) return "linked_events";

        const [linkedGroupEvent] = await tx
          .select({ id: schema.groupEvents.id })
          .from(schema.groupEvents)
          .where(eq(schema.groupEvents.activity_plan_id, input.planId))
          .limit(1);
        if (linkedGroupEvent) return "linked_events";

        const deleted = await tx
          .delete(schema.activityPlans)
          .where(
            and(
              eq(schema.activityPlans.id, input.planId),
              eq(schema.activityPlans.profile_id, input.profileId),
            ),
          )
          .returning({ id: schema.activityPlans.id });
        if (deleted.length !== 1) throw new Error("Activity plan changed during deletion");
        return "deleted";
      });
    },
  };
}
