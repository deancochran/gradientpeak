import { Button } from "@repo/ui/components/button";
import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";

import { ProtectedHeader } from "../components/protected/protected-header";
import {
  RecordingStorageBoundary,
  useRecordingStorageReadiness,
} from "../components/providers/recording-storage-boundary";
import {
  authSessionMiddleware,
  getProtectedAccessRedirect,
  resolveRouteAuthSession,
  resolveRouteProfileState,
} from "../lib/auth/route-guards";
import { TimerOnlyRecordingProvider, useTimerOnlyRecording } from "../lib/recording/provider";

export const Route = createFileRoute("/_protected")({
  server: {
    middleware: [authSessionMiddleware],
  },
  beforeLoad: async ({ location, serverContext }) => {
    const session = await resolveRouteAuthSession(serverContext);
    const initialDecision = getProtectedAccessRedirect(session, "completed", location.href);

    if (initialDecision?.destination === "login") {
      throw redirect({
        to: "/auth/login",
        search: { flash: undefined, flashType: undefined, redirect: location.href },
      });
    }
    if (initialDecision?.destination === "verify") {
      throw redirect({
        to: "/auth/verify",
        search: {
          email: undefined,
          flash: undefined,
          flashType: undefined,
          source: undefined,
        },
      });
    }

    const decision = getProtectedAccessRedirect(
      session,
      await resolveRouteProfileState(serverContext),
      location.href,
    );
    if (decision?.destination === "onboarding") {
      throw redirect({
        to: "/onboarding",
        search: {
          error: undefined,
          flash: undefined,
          flashType: undefined,
          redirect: decision.redirectTo,
        },
      });
    }

    return { authUserId: session?.user.id };
  },
  component: ProtectedLayout,
});

function ProtectedLayout() {
  const { authUserId } = Route.useRouteContext();
  if (!authUserId) throw new Error("The protected layout requires an authenticated user.");

  return (
    <RecordingStorageBoundary>
      <ProtectedRecordingProvider ownerId={authUserId} />
    </RecordingStorageBoundary>
  );
}

function ProtectedRecordingProvider({ ownerId }: { ownerId: string }) {
  const storage = useRecordingStorageReadiness();

  return (
    <TimerOnlyRecordingProvider enabled={storage.state === "ready"} key={ownerId} ownerId={ownerId}>
      <ProtectedRecordingShell />
    </TimerOnlyRecordingProvider>
  );
}

export function ProtectedRecordingShell() {
  const recording = useTimerOnlyRecording();
  const storage = useRecordingStorageReadiness();
  const location = useLocation();
  const lifecycle = recording.state.reducer.lifecycle;
  const recordingLocked =
    lifecycle === "recording" || lifecycle === "paused" || lifecycle === "finishing";
  const isResolving = recording.hydrationStatus === "hydrating";
  const isRecorderPage =
    location.pathname === "/record" || location.pathname.startsWith("/record/");
  const showStorageStatus = isRecorderPage && storage.state !== "ready";
  const showRecoveryStatus = isRecorderPage && storage.state === "ready" && isResolving;
  const shouldRenderOutlet = isRecorderPage
    ? !showStorageStatus && !showRecoveryStatus
    : !recordingLocked;

  return (
    <div className="gp-protected-shell flex min-h-screen flex-col">
      {recordingLocked ? null : <ProtectedHeader />}
      <main
        className={
          recordingLocked ? "w-full flex-1" : "mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:px-8"
        }
      >
        {showStorageStatus ? (
          <RecordingStorageStatus
            retry={storage.retry}
            state={storage.state === "blocked" ? "blocked" : "checking"}
          />
        ) : showRecoveryStatus ? (
          <p aria-live="polite" className="py-4 text-sm text-muted-foreground">
            Checking for a saved recording…
          </p>
        ) : null}
        {shouldRenderOutlet ? <Outlet /> : null}
        {recordingLocked && !isRecorderPage ? (
          <p aria-live="polite" className="py-4 text-sm text-muted-foreground">
            Returning to your active recording…
          </p>
        ) : null}
      </main>
    </div>
  );
}

function RecordingStorageStatus({
  state,
  retry,
}: {
  state: "checking" | "blocked";
  retry: () => void;
}) {
  return (
    <div aria-live="polite" className="py-4">
      <p className="text-sm text-muted-foreground">
        {state === "blocked" ? "Recorder storage is blocked." : "Preparing recorder"}
      </p>
      {state === "blocked" ? (
        <Button onClick={retry} size="sm" type="button" variant="outline">
          Retry
        </Button>
      ) : null}
    </div>
  );
}
