import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanLibrary } from "../../../components/training-plan/training-plan-library";

export const Route = createFileRoute("/_protected/training-plans/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string; tab: "owned" | "templates" } => ({
    q: typeof search.q === "string" && search.q ? search.q.slice(0, 100) : undefined,
    tab: search.tab === "templates" ? "templates" : "owned",
  }),
  component: TrainingPlansPage,
});

function TrainingPlansPage() {
  const navigate = Route.useNavigate();
  const { q, tab } = Route.useSearch();
  return (
    <TrainingPlanLibrary
      onCreate={() => void navigate({ to: "/training-plans/create" })}
      onOpen={(planId) =>
        void navigate({ to: "/training-plans/$planId", params: { planId } } as never)
      }
      onSearchChange={(nextQuery) =>
        void navigate({ search: { q: nextQuery || undefined, tab }, replace: true })
      }
      searchValue={q ?? ""}
      tab={tab}
      onTabChange={(nextTab) => void navigate({ search: { q, tab: nextTab }, replace: true })}
    />
  );
}
