// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RelationshipList } from "./relationship-list";

function renderList(node: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => node });
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("RelationshipList", () => {
  it("renders a recoverable failure instead of an empty list", async () => {
    const retry = vi.fn();
    renderList(
      <RelationshipList
        emptyMessage="No followers"
        errorMessage="Unable to load followers"
        getProfileLink={(userId) => ({
          to: "/user/$userId",
          params: { userId },
          search: { flash: undefined, flashType: undefined },
        })}
        hasMore={false}
        isLoading={false}
        onRetry={retry}
        title="{count} followers"
        total={0}
        users={[]}
      />,
    );

    expect(await screen.findByText("Unable to load followers")).toBeTruthy();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(retry).toHaveBeenCalledOnce();
  });
});
