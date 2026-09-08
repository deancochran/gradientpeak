import { planningLedgerRequestSchema } from "@repo/core";
import { Redirect, useLocalSearchParams } from "expo-router";
import { ROUTES } from "@/lib/constants/routes";

/** Compatibility route: day details now have one canonical Training Breakdown surface. */
export default function CalendarDayRedirect() {
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const request = planningLedgerRequestSchema.safeParse({
    anchorDate: typeof params.date === "string" ? params.date : "",
    period: "day",
  });

  return (
    <Redirect
      href={
        request.success
          ? ROUTES.PLAN.PLANNING_LEDGER({
              anchorDate: request.data.anchorDate,
              period: "day",
            })
          : ROUTES.PLAN.CALENDAR
      }
    />
  );
}
