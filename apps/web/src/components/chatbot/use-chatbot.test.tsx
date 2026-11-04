// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useChatbot } from "./use-chatbot";

const requestId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";
const turnId = "33333333-3333-4333-8333-333333333333";

vi.mock("../../lib/api/client", () => ({
  createWebHeaders: () => new Headers({ "x-test": "web" }),
}));

function Probe({ actorId }: { actorId: string }) {
  const { client, send, state } = useChatbot(actorId);
  return (
    <>
      <button type="button" onClick={() => void send("Hello")}>
        Send
      </button>
      <button type="button" onClick={() => client.stop()}>
        Stop
      </button>
      <output>{state.status}</output>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("useChatbot lifecycle", () => {
  it("keeps its actual controller usable through the StrictMode effect probe", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ status: "completed", text: "Done", threadId, turnId }),
    );
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("crypto", { randomUUID: () => requestId });

    render(
      <StrictMode>
        <Probe actorId="actor-a" />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, init] =
      (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[0] ?? [];
    expect(new Headers(init?.headers).get("x-test")).toBe("web");
    expect(JSON.parse((init?.body as string) ?? "{}")).toMatchObject({
      requestId,
      text: "Hello",
    });
    await waitFor(() => expect(screen.getByText("completed")).toBeTruthy());
  });

  it("aborts the real controller on actor replacement and unmount without late callbacks", async () => {
    let signal: AbortSignal | undefined;
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("crypto", { randomUUID: () => requestId });
    const view = render(
      <StrictMode>
        <Probe actorId="actor-a" />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(signal).toBeDefined());
    act(() =>
      view.rerender(
        <StrictMode>
          <Probe actorId="actor-b" />
        </StrictMode>,
      ),
    );
    await waitFor(() => expect(signal?.aborted).toBe(true));
    view.unmount();
  });
});
