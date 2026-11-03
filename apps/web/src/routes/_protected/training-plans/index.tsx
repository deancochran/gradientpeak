import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanLibrary } from "../../../components/training-plan/training-plan-library";

export const Route = createFileRoute("/_protected/training-plans/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" && search.q ? search.q.slice(0, 100) : undefined,
  }),
  component: TrainingPlansPage,
});

function TrainingPlansPage() {
  const navigate = Route.useNavigate();
  const { q } = Route.useSearch();
  return (
    <TrainingPlanLibrary
      onCreate={() => void navigate({ to: "/training-plans/create" })}
      onOpen={(planId) =>
        void navigate({ to: "/training-plans/$planId", params: { planId } } as never)
      }
      onSearchChange={(nextQuery) =>
        void navigate({ search: { q: nextQuery || undefined }, replace: true })
      }
      searchValue={q ?? ""}
    />
  );
}
