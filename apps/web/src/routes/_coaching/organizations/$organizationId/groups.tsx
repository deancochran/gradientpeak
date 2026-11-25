import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout only: list/create lives at `groups/`, so a detail route never renders a stale parent list. */
export const Route = createFileRoute("/_coaching/organizations/$organizationId/groups")({
  component: Outlet,
});
