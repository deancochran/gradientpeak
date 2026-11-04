// @vitest-environment jsdom

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: {
    data: null as unknown,
    error: null as Error | null,
    isPending: true,
    refetch: vi.fn(),
  },
  router: { clearCache: vi.fn(), invalidate: vi.fn() },
  routerState: { matches: [] as Array<{ status: string }> },
}));

vi.mock("../../lib/auth/client", () => ({
  authClient: { useSession: () => mocks.session },
  normalizeWebAuthSession: (value: unknown) => value,
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => mocks.router,
  useRouterState: ({ select }: { select: (state: typeof mocks.routerState) => unknown }) =>
    select(mocks.routerState),
}));

import {
  AuthenticatedViewerBoundary,
  AuthProvider,
  AuthSessionRouteInvalidator,
  useAuth,
} from "./auth-provider";

const firstUser = { id: "first", email: "first@example.test", emailVerified: true };
const secondUser = { id: "second", email: "second@example.test", emailVerified: true };
const thirdUser = { id: "third", email: "third@example.test", emailVerified: true };
const firstViewer = { version: 1 as const, user: firstUser };
const secondViewer = { version: 1 as const, user: secondUser };
const thirdViewer = { version: 1 as const, user: thirdUser };

function AuthState() {
  const { isLoading, user } = useAuth();
  return <output>{isLoading ? "loading" : (user?.email ?? "signed-out")}</output>;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function renderAuth(initialViewer = firstViewer) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["private"], { secret: "must-clear" });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialViewer={initialViewer}>
        <AuthState />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { queryClient, ...rendered };
}

afterEach(() => {
  cleanup();
  mocks.session = { data: null, error: null, isPending: true, refetch: vi.fn() };
  mocks.router.clearCache.mockReset();
  mocks.router.invalidate.mockReset();
  mocks.routerState = { matches: [] };
});

describe("AuthProvider", () => {
  it("keeps the credential-free SSR user through the client session pending state", () => {
    renderAuth();

    expect(screen.getByRole("status").textContent).toBe(firstUser.email);
  });

  it("fails closed and clears hydrated private queries when an authoritative session is absent", () => {
    const { queryClient, rerender } = renderAuth();
    mocks.session = { data: null, error: null, isPending: false, refetch: vi.fn() };

    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthState />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("status").textContent).toBe("signed-out");
    expect(queryClient.getQueryData(["private"])).toBeUndefined();
  });

  it("replaces an account switch and clears the prior account cache", () => {
    const { queryClient, rerender } = renderAuth();
    mocks.session = {
      data: { user: secondUser },
      error: null,
      isPending: false,
      refetch: vi.fn(),
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthState />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("status").textContent).toBe(secondUser.email);
    expect(queryClient.getQueryData(["private"])).toBeUndefined();
  });

  it("fences protected children while a different authoritative identity is re-authorized", () => {
    const queryClient = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
        </AuthProvider>
      </QueryClientProvider>,
    );
    mocks.session = {
      data: { user: secondUser },
      error: null,
      isPending: false,
      refetch: vi.fn(),
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByText("Private A content")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Refreshing account access");
  });

  it("discards a late private A query after an A-to-B identity fence", async () => {
    const queryClient = new QueryClient();
    const lateA = deferred<{ secret: string }>();
    const started = vi.fn();
    function PrivateAQuery() {
      const query = useQuery({
        queryKey: ["private", "A"],
        queryFn: () => {
          started();
          // Deliberately ignore AbortSignal: cancellation must still prevent a
          // late legacy result from being retained after the identity fence.
          return lateA.promise;
        },
      });
      return <output>{query.data?.secret ?? "A query pending"}</output>;
    }
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthenticatedViewerBoundary>
            <PrivateAQuery />
          </AuthenticatedViewerBoundary>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(started).toHaveBeenCalledOnce());
    mocks.session = {
      data: { user: secondUser },
      error: null,
      isPending: false,
      refetch: vi.fn(),
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthenticatedViewerBoundary>
            <PrivateAQuery />
          </AuthenticatedViewerBoundary>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await act(async () => lateA.resolve({ secret: "private A response" }));

    expect(queryClient.getQueryData(["private", "A"])).toBeUndefined();
    expect(screen.queryByText("private A response")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Refreshing account access");
  });

  it("keeps the last validated owner during an uncertain session refresh", () => {
    const { queryClient, rerender } = renderAuth();
    mocks.session = {
      data: null,
      error: new TypeError("network unavailable"),
      isPending: false,
      refetch: vi.fn(),
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthState />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("status").textContent).toBe(firstUser.email);
    expect(queryClient.getQueryData(["private"])).toEqual({ secret: "must-clear" });
  });

  it("does not resurrect A after an authoritative logout followed by a transport failure", () => {
    const { queryClient, rerender } = renderAuth();
    mocks.session = { data: null, error: null, isPending: false, refetch: vi.fn() };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthState />
        </AuthProvider>
      </QueryClientProvider>,
    );
    mocks.session = {
      data: null,
      error: new TypeError("network unavailable"),
      isPending: false,
      refetch: vi.fn(),
    };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthState />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("status").textContent).toBe("signed-out");
    expect(queryClient.getQueryData(["private"])).toBeUndefined();
  });

  it("keeps A fenced after reauthorization failure, retries, then renders only fresh B", async () => {
    const queryClient = new QueryClient();
    mocks.router.invalidate
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue(undefined);
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    mocks.session = { data: { user: secondUser }, error: null, isPending: false, refetch: vi.fn() };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry access refresh" })).toBeTruthy(),
    );
    expect(screen.queryByText("Private A content")).toBeNull();
    await screen.getByRole("button", { name: "Retry access refresh" }).click();
    await waitFor(() => expect(mocks.router.invalidate).toHaveBeenCalledTimes(2));

    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={secondViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private B content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Private B content")).toBeTruthy();
    expect(screen.queryByText("Private A content")).toBeNull();
  });

  it("offers retry when invalidation fulfills with a router match error", async () => {
    const queryClient = new QueryClient();
    mocks.router.invalidate.mockResolvedValue(undefined);
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    mocks.session = { data: { user: secondUser }, error: null, isPending: false, refetch: vi.fn() };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mocks.router.invalidate).toHaveBeenCalledOnce());

    mocks.routerState = { matches: [{ status: "error" }] };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry access refresh" })).toBeTruthy(),
    );
    expect(screen.queryByText("Private A content")).toBeNull();

    mocks.routerState = { matches: [] };
    await screen.getByRole("button", { name: "Retry access refresh" }).click();
    await waitFor(() => expect(mocks.router.invalidate).toHaveBeenCalledTimes(2));
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={secondViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private B content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Private B content")).toBeTruthy();
  });

  it("keeps C fenced and ignores B's late completion when identities change A to B to C", async () => {
    const queryClient = new QueryClient();
    const bInvalidation = deferred<void>();
    const cInvalidation = deferred<void>();
    mocks.router.invalidate
      .mockReturnValueOnce(bInvalidation.promise)
      .mockReturnValueOnce(cInvalidation.promise);
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    mocks.session = { data: { user: secondUser }, error: null, isPending: false, refetch: vi.fn() };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mocks.router.invalidate).toHaveBeenCalledOnce());
    mocks.session = { data: { user: thirdUser }, error: null, isPending: false, refetch: vi.fn() };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mocks.router.invalidate).toHaveBeenCalledTimes(2));

    await act(async () => cInvalidation.resolve());
    await act(async () => {
      bInvalidation.reject(new TypeError("stale B failure"));
      await bInvalidation.promise.catch(() => undefined);
    });
    expect(screen.queryByText("Private A content")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry access refresh" })).toBeNull();

    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={thirdViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private C content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Private C content")).toBeTruthy();
  });

  it("starts the anonymous transition invalidation without rendering old protected children", async () => {
    const queryClient = new QueryClient();
    mocks.router.invalidate.mockResolvedValue(undefined);
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    mocks.session = { data: null, error: null, isPending: false, refetch: vi.fn() };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialViewer={firstViewer}>
          <AuthSessionRouteInvalidator>
            <AuthenticatedViewerBoundary>Private A content</AuthenticatedViewerBoundary>
          </AuthSessionRouteInvalidator>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mocks.router.invalidate).toHaveBeenCalledOnce());
    expect(screen.queryByText("Private A content")).toBeNull();
  });
});
