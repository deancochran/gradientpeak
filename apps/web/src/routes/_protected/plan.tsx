import { createFileRoute } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { PlanDashboard } from "../../components/planning/plan-dashboard";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { isValidDateKey } from "../../lib/planning";

export {
  getScheduledWorkTypeLabel,
  getUpcomingScheduledWorkItems,
} from "../../components/planning/plan-dashboard";

function isPlanDateSearch(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidDateKey(value);
}

export const Route = createFileRoute("/_protected/plan")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(isPlanDateSearch(search.date) ? { date: search.date } : {}),
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
  }),
  component: PlanPage,
});

function PlanPage() {
  const navigate = Route.useNavigate();
  const { date, flash, flashType } = Route.useSearch();
  return (
    <div className="space-y-6">
      <RouteFlashToast
        {...(flash === undefined ? {} : { message: flash })}
        {...(flashType === undefined ? {} : { type: flashType })}
        clear={() =>
          void navigate({
            to: "/plan",
            search: { ...(date ? { date } : {}), flash: undefined, flashType: undefined },
            replace: true,
          })
        }
      />
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Target className="h-6 w-6 text-muted-foreground" />
          Plan
        </h1>
      </div>

      <PlanDashboard
        {...(date ? { selectedDate: date } : {})}
        onSelectedDateChange={(nextDate) =>
          void navigate({
            to: "/plan",
            search: { date: nextDate, flash: undefined, flashType: undefined },
          })
        }
      />
    </div>
  );
}
