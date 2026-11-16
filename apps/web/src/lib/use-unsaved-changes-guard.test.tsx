/** @vitest-environment jsdom */

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PENDING_SAVE_MESSAGE, useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

function GuardHarness() {
  const [draft, setDraft] = useState("");
  const [renderVersion, setRenderVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [discardCount, setDiscardCount] = useState(0);
  const { guardedCancel, markSaveFailed, markSaved } = useUnsavedChangesGuard({
    draft,
    dirty: draft.length > 0,
    message: "Discard draft?",
    pending,
  });
  return (
    <main>
      <label htmlFor="draft">Draft</label>
      <input id="draft" onChange={(event) => setDraft(event.target.value)} value={draft} />
      <button onClick={markSaved} type="button">
        Save succeeded
      </button>
      <button onClick={markSaveFailed} type="button">
        Save failed
      </button>
      <button onClick={() => setRenderVersion((value) => value + 1)} type="button">
        Re-render {renderVersion}
      </button>
      <button onClick={() => setPending((value) => !value)} type="button">
        {pending ? "Pending on" : "Pending off"}
      </button>
      <button
        onClick={() => guardedCancel(() => setDiscardCount((value) => value + 1))}
        type="button"
      >
        Attempt cancel
      </button>
      <p>Discards: {discardCount}</p>
    </main>
  );
}

function renderGuard() {
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    component: GuardHarness,
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

describe("useUnsavedChangesGuard", () => {
  it("keeps a dirty draft when native confirmation is cancelled", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const { router } = renderGuard();
    const draft = await screen.findByLabelText("Draft");
    fireEvent.change(draft, { target: { value: "draft" } });
    void router.navigate({ to: "/next" } as never);

    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith("Discard draft?"));
    expect(screen.getByLabelText("Draft")).toBe(draft);
  });

  it("allows navigation when native confirmation discards a dirty draft", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const { router } = renderGuard();
    fireEvent.change(await screen.findByLabelText("Draft"), { target: { value: "draft" } });
    await router.navigate({ to: "/next" } as never);

    expect(await screen.findByText("Next page")).toBeTruthy();
  });

  it("bypasses confirmation while clean", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const { router } = renderGuard();
    await router.navigate({ to: "/next" } as never);

    expect(await screen.findByText("Next page")).toBeTruthy();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("reconfigures beforeunload after success, rearms after a later edit, and retains guarding after failure", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const { beforeUnloadActive, router } = renderGuard();
    const draft = await screen.findByLabelText("Draft");
    fireEvent.change(draft, { target: { value: "first" } });
    await waitFor(() => expect(beforeUnloadActive()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Save succeeded" }));
    fireEvent.click(screen.getByRole("button", { name: /Re-render/ }));
    await waitFor(() => expect(beforeUnloadActive()).toBe(false));
    await router.navigate({ to: "/next" } as never);
    expect(await screen.findByText("Next page")).toBeTruthy();

    const { beforeUnloadActive: secondBeforeUnloadActive, router: secondRouter } = renderGuard();
    const secondDraft = await screen.findByLabelText("Draft");
    fireEvent.change(secondDraft, { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "Save succeeded" }));
    fireEvent.change(secondDraft, { target: { value: "second" } });
    await waitFor(() => expect(secondBeforeUnloadActive()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Save failed" }));
    await waitFor(() => expect(secondBeforeUnloadActive()).toBe(true));
    void secondRouter.navigate({ to: "/next" } as never);
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(screen.getByLabelText("Draft")).toBe(secondDraft);
  });

  it("blocks in-app navigation and keeps beforeunload active while pending on a clean draft", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    vi.stubGlobal("alert", vi.fn());
    const { beforeUnloadActive, router } = renderGuard();
    fireEvent.click(await screen.findByRole("button", { name: "Pending off" }));
    await waitFor(() => expect(beforeUnloadActive()).toBe(true));
    void router.navigate({ to: "/next" } as never);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(PENDING_SAVE_MESSAGE));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByText("Discards: 0")).toBeTruthy();
  });

  it("refuses to discard while pending and gives pending feedback", async () => {
    vi.stubGlobal("alert", vi.fn());
    const { beforeUnloadActive } = renderGuard();
    fireEvent.click(await screen.findByRole("button", { name: "Pending off" }));
    await waitFor(() => expect(beforeUnloadActive()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Attempt cancel" }));

    expect(window.alert).toHaveBeenCalledWith(PENDING_SAVE_MESSAGE);
    expect(screen.getByText("Discards: 0")).toBeTruthy();
  });

  it("bypasses navigation and disables beforeunload after an authoritative save while pending", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    vi.stubGlobal("alert", vi.fn());
    const { beforeUnloadActive, router } = renderGuard();
    const draft = await screen.findByLabelText("Draft");
    fireEvent.change(draft, { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Pending off" }));
    await waitFor(() => expect(beforeUnloadActive()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Save succeeded" }));
    await waitFor(() => expect(beforeUnloadActive()).toBe(false));
    await router.navigate({ to: "/next" } as never);

    expect(await screen.findByText("Next page")).toBeTruthy();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });
});
