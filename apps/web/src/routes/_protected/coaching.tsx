import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/coaching")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
