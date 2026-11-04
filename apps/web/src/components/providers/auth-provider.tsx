import type { AuthUser } from "@repo/auth/session";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { authClient, normalizeWebAuthSession } from "../../lib/auth/client";
import { type PublicAuthViewer, toPublicAuthViewer } from "../../lib/auth/route-guards";

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isTransitioning: boolean;
  transitionTarget: string | null;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);
const AuthTransitionContext = createContext<{ failed: boolean; retry: () => void }>({
  failed: false,
  retry: () => undefined,
});

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AuthProvider({
  children,
  initialViewer,
}: {
  children: React.ReactNode;
  /** Server-authoritative, credential-free root-route bootstrap snapshot. */
  initialViewer: PublicAuthViewer;
}) {
  const { data, isPending, error, refetch } = authClient.useSession();
  const queryClient = useQueryClient();
  const lastValidatedUser = useRef<AuthUser | null>(initialViewer.user);

  const session = normalizeWebAuthSession(data);
  const authoritativeViewer = isPending || error ? null : toPublicAuthViewer(session);
  // The server rendered this request for initialUser. Do not replace that
  // identity with the client's empty pending value during hydration. A
  // transport failure is unknown freshness, not proof of logout: retain only
  // the last server/client-validated identity until an authoritative null or
  // a different user arrives.
  const user = authoritativeViewer ? authoritativeViewer.user : lastValidatedUser.current;
  const isTransitioning =
    authoritativeViewer !== null && authoritativeViewer.user?.id !== initialViewer.user?.id;
  const transitionTarget = isTransitioning ? (authoritativeViewer?.user?.id ?? "anonymous") : null;
  const isAuthenticated = Boolean(user);

  useBrowserLayoutEffect(() => {
    // A successful authoritative anonymous response is a durable revocation
    // boundary. Never retain A as a fallback for a later transport failure.
    if (authoritativeViewer !== null) lastValidatedUser.current = authoritativeViewer.user;
  }, [authoritativeViewer]);

  useBrowserLayoutEffect(() => {
    if (!isTransitioning) return;
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [isTransitioning, queryClient]);

  const refreshSession = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Better Auth owns its own cross-tab synchronization. Refetch on a resumed
  // document as well so a tab that was inactive during a server-side logout or
  // revocation fails closed before it resumes showing private query results.
  useEffect(() => {
    const refreshOnResume = () => {
      if (document.visibilityState === "visible") void refreshSession();
    };
    window.addEventListener("focus", refreshOnResume);
    document.addEventListener("visibilitychange", refreshOnResume);
    return () => {
      window.removeEventListener("focus", refreshOnResume);
      document.removeEventListener("visibilitychange", refreshOnResume);
    };
  }, [refreshSession]);

  const value = useMemo(
    () => ({
      user,
      isLoading: isPending && initialViewer.user === null,
      isAuthenticated,
      isTransitioning,
      transitionTarget,
      refreshSession,
    }),
    [
      initialViewer.user,
      isAuthenticated,
      isPending,
      isTransitioning,
      refreshSession,
      transitionTarget,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}

/** Must be rendered inside the router, not in the outer app provider wrapper. */
export function AuthSessionRouteInvalidator({ children }: { children: React.ReactNode }) {
  const { transitionTarget } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const routerHasError = useRouterState({
    select: (state) => state.matches.some((match) => match.status === "error"),
  });
  const generation = useRef(0);
  const targetRef = useRef<string | null>(transitionTarget);
  targetRef.current = transitionTarget;
  const [attempt, setAttempt] = useState<
    { generation: number; phase: "running" | "settled" | "failed"; target: string } | undefined
  >();
  const attemptRef = useRef(attempt);
  attemptRef.current = attempt;

  const retry = useCallback(() => {
    if (!targetRef.current) return;
    setAttempt({ generation: ++generation.current, phase: "running", target: targetRef.current });
  }, []);

  useBrowserLayoutEffect(() => {
    if (!transitionTarget) {
      if (attempt) setAttempt(undefined);
      return;
    }
    if (attempt?.target === transitionTarget) return;
    setAttempt({ generation: ++generation.current, phase: "running", target: transitionTarget });
  }, [attempt, transitionTarget]);

  useBrowserLayoutEffect(() => {
    if (!attempt || attempt.phase !== "running") return;
    const currentAttempt = attempt;
    void queryClient.cancelQueries();
    queryClient.clear();
    router.clearCache();
    void (async () => {
      try {
        await router.invalidate();
      } catch {
        // A later identity must not inherit a stale request's failure.
        if (
          targetRef.current === currentAttempt.target &&
          attemptRef.current?.generation === currentAttempt.generation
        ) {
          setAttempt({ ...currentAttempt, phase: "failed" });
        }
        return;
      }
      if (
        targetRef.current === currentAttempt.target &&
        attemptRef.current?.generation === currentAttempt.generation
      ) {
        setAttempt({ ...currentAttempt, phase: "settled" });
      }
    })();
  }, [attempt, queryClient, router]);

  useBrowserLayoutEffect(() => {
    if (attempt?.phase !== "settled" || !routerHasError) return;
    setAttempt({ ...attempt, phase: "failed" });
  }, [attempt, routerHasError]);

  const failed = attempt?.target === transitionTarget && attempt.phase === "failed";

  return (
    <AuthTransitionContext.Provider value={{ failed, retry }}>
      {children}
    </AuthTransitionContext.Provider>
  );
}

export function AuthenticatedViewerBoundary({ children }: { children: React.ReactNode }) {
  const { isTransitioning } = useAuth();
  const { failed, retry } = useContext(AuthTransitionContext);
  if (isTransitioning)
    return (
      <div aria-live="polite" className="py-4 text-sm text-muted-foreground">
        <p role="status">
          {failed ? "Account access refresh failed." : "Refreshing account access…"}
        </p>
        {failed ? (
          <button className="underline" onClick={retry} type="button">
            Retry access refresh
          </button>
        ) : null}
      </div>
    );
  return children;
}
