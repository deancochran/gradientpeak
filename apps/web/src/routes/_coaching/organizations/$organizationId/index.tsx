import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/organizations/$organizationId/dashboard",
      params: { organizationId: params.organizationId },
    });
  },
});
