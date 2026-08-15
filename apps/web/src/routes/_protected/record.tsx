import { createFileRoute, Outlet } from "@tanstack/react-router";

import { RecordingStorageBoundary } from "../../components/providers/recording-storage-boundary";
import { TimerOnlyRecordingProvider } from "../../lib/recording/provider";

export const Route = createFileRoute("/_protected/record")({
  component: RecordLayout,
});

export function RecordLayout() {
  const { authUserId } = Route.useRouteContext();

  if (!authUserId) {
    throw new Error("The protected recording route requires an authenticated user.");
  }

  return (
    <RecordingStorageBoundary>
      <TimerOnlyRecordingProvider key={authUserId} ownerId={authUserId}>
        <Outlet />
      </TimerOnlyRecordingProvider>
    </RecordingStorageBoundary>
  );
}
