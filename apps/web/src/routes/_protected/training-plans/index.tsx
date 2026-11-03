import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanLibrary } from "../../../components/training-plan/training-plan-library";
import {
  getOwnedTrainingPlansInput,
  getTemplateTrainingPlansInput,
} from "../../../components/training-plan/training-plan-library-inputs";
import { loadRouteQuery } from "../../../lib/api/route-loading";

export const Route = createFileRoute("/_protected/training-plans/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string; tab: "owned" | "templates" } => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q.slice(0, 100) } : {}),
    tab: search.tab === "templates" ? "templates" : "owned",
  }),
  loaderDeps: ({ search }) => ({ q: search.q, tab: search.tab }),
  loader: ({ context, deps }) => {
    const search = deps.q ?? "";
    if (deps.tab === "templates") {
      const input = getTemplateTrainingPlansInput(search);
      return loadRouteQuery(
        () => context.apiUtils.trainingPlans.listTemplates.getInfiniteData(input),
        () =>
          context.apiUtils.trainingPlans.listTemplates.fetchInfinite(input, {
            getNextPageParam: (page) => page.nextCursor,
          } as never),
      );
    }
    const input = getOwnedTrainingPlansInput(search);
    return loadRouteQuery(
      () => context.apiUtils.trainingPlans.list.getInfiniteData(input),
      () =>
        context.apiUtils.trainingPlans.list.fetchInfinite(input, {
          getNextPageParam: (page) => page.nextCursor,
        } as never),
    );
  },
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
        void navigate({
          search: { ...(nextQuery ? { q: nextQuery } : {}), tab },
          replace: true,
        })
      }
      searchValue={q ?? ""}
      tab={tab}
      onTabChange={(nextTab) =>
        void navigate({
          search: { ...(q ? { q } : {}), tab: nextTab },
          replace: true,
        })
      }
    />
  );
}
