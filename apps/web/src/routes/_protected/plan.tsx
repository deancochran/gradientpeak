import { createFileRoute } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { PlanDashboard } from "../../components/planning/plan-dashboard";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";

export {
  getScheduledWorkTypeLabel,
  getUpcomingScheduledWorkItems,
} from "../../components/planning/plan-dashboard";

export const Route = createFileRoute("/_protected/plan")({
  validateSearch: (search: Record<string, unknown>) => ({
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
  const { flash, flashType } = Route.useSearch();
  return (
    <div className="space-y-6">
      <RouteFlashToast
        message={flash}
        type={flashType}
        clear={() =>
          void navigate({
            to: "/plan",
            search: { flash: undefined, flashType: undefined },
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

      <PlanDashboard />
    </div>
  );
}
