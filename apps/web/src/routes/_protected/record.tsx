import { createFileRoute, Outlet } from "@tanstack/react-router";

import { useAuth } from "../../components/providers/auth-provider";
import { TimerOnlyRecordingProvider } from "../../lib/recording/provider";

export const Route = createFileRoute("/_protected/record")({
  component: RecordLayout,
});

function RecordLayout() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <TimerOnlyRecordingProvider key={user.id} ownerId={user.id}>
      <Outlet />
    </TimerOnlyRecordingProvider>
  );
}
