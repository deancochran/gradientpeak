import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/record")({
  component: RecordLayout,
});

export function RecordLayout() {
  return <Outlet />;
}
