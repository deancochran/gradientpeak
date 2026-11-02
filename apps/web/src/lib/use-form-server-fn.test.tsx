/** @vitest-environment jsdom */

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  redirect,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFormServerFn } from "./use-form-server-fn";
import { PENDING_SAVE_MESSAGE, useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

type RawServerFn = (args: unknown) => Promise<string>;

function FormHarness({ serverFn }: { serverFn: RawServerFn }) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [account, setAccount] = useState("first");
  const { markSaveFailed, markSaved } = useUnsavedChangesGuard({
    draft,
    dirty: draft.length > 0,
    pending,
  });
  const runServerFn = useFormServerFn(serverFn, markSaved, account);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      const outcome = await runServerFn({ data: new FormData(event.currentTarget) as never });
      setResult(outcome ?? "resolved");
    } catch {
      markSaveFailed();
      setResult("rejected");
    } finally {
      setPending(false);
    }
  };

  return (
    <main>
      <button type="button" onClick={() => setAccount("second")}>
        Change account
      </button>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="draft-input">Draft</label>
        <input id="draft-input" onChange={(event) => setDraft(event.target.value)} value={draft} />
        <button type="submit">Submit</button>
      </form>
      <p data-testid="result">{result ?? "none"}</p>
    </main>
  );
}

function renderForm(serverFn: RawServerFn) {
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    component: () => <FormHarness serverFn={serverFn} />,
    getParentRoute: () => rootRoute,
    path: "/",
  });
  const nextRoute = createRoute({
    component: () => <p>Next page</p>,
    getParentRoute: () => rootRoute,
    path: "/next",
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const originalBlock = history.block.bind(history);
  const block = vi.spyOn(history, "block");
  // enableBeforeUnload is a function consulted per beforeunload, so read it live.
  let enableBeforeUnload: boolean | (() => boolean) = false;
  block.mockImplementation((options) => {
    enableBeforeUnload = options.enableBeforeUnload ?? false;
    const unblock = originalBlock(options);
    return () => {
      enableBeforeUnload = false;
      unblock();
    };
  });
  const router = createRouter({
    history,
    routeTree: rootRoute.addChildren([indexRoute, nextRoute]),
  });
  return {
    beforeUnloadActive: () =>
      enableBeforeUnload === true ||
      (typeof enableBeforeUnload === "function" && enableBeforeUnload()),
    block,
    router,
    ...render(<RouterProvider router={router} />),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useFormServerFn", () => {
  it("suppresses a stale account redirect before it reaches router navigation or the success callback", async () => {
    let reject!: (reason: unknown) => void;
    const serverFn = vi.fn(
      () =>
        new Promise<string>((_, fail) => {
          reject = fail;
        }),
    );
    const { beforeUnloadActive, router } = renderForm(serverFn);
    fireEvent.change(await screen.findByLabelText("Draft"), { target: { value: "notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(serverFn).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Change account" }));
    reject(redirect({ href: "/next" }));
    await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("rejected"));
    expect(beforeUnloadActive()).toBe(true);
    expect(router.state.location.pathname).toBe("/");
  });
  it("keeps the guard pending and protected while the server request is unresolved", async () => {
    vi.stubGlobal("alert", vi.fn());
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    let reveal!: (outcome: string) => void;
    const serverFn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          reveal = resolve;
        }),
    );
    const { beforeUnloadActive, router } = renderForm(serverFn);

    fireEvent.change(await screen.findByLabelText("Draft"), { target: { value: "notes" } });
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));
    await waitFor(() => expect(serverFn).toHaveBeenCalledTimes(1));
    expect(beforeUnloadActive()).toBe(true);

    void router.navigate({ to: "/next" } as never);
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(PENDING_SAVE_MESSAGE));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByTestId("result").textContent).toBe("none");

    reveal("ok");
    await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("ok"));
    await waitFor(() => expect(beforeUnloadActive()).toBe(false));

    await router.navigate({ to: "/next" } as never);
    expect(await screen.findByText("Next page")).toBeTruthy();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("retains the armed guard after a non-redirect rejection", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const serverFn = vi.fn().mockRejectedValue(new Error("Storage unavailable"));
    const { beforeUnloadActive, router } = renderForm(serverFn);

    fireEvent.change(await screen.findByLabelText("Draft"), { target: { value: "notes" } });
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));

    await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("rejected"));
    expect(beforeUnloadActive()).toBe(true);

    void router.navigate({ to: "/next" } as never);
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith("Discard unsaved changes?"));
    expect(screen.getByLabelText("Draft")).toBeTruthy();
  });

  it("disarms the guard before navigating on a confirmed redirect", async () => {
    vi.stubGlobal("alert", vi.fn());
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const serverFn = vi.fn(async () => {
      throw redirect({ href: "/next" });
    });
    renderForm(serverFn);

    fireEvent.change(await screen.findByLabelText("Draft"), { target: { value: "notes" } });
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Next page")).toBeTruthy();
    expect(serverFn).toHaveBeenCalledTimes(1);
    expect(window.alert).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
