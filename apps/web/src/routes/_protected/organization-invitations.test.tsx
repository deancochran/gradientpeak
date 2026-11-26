// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { type ComponentType, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authUserId: "actor-one" as string | undefined }));
const takeHandoff = vi.hoisted(() => vi.fn(() => "a".repeat(43)));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useRouteContext: () => ({ authUserId: state.authUserId }),
  }),
}));
vi.mock("../../components/coaching/invitation-response/invitation-response", () => ({
  InvitationResponse: ({
    actorId,
    initialInvitationToken,
  }: {
    actorId: string;
    initialInvitationToken?: string;
  }) => (
    <div data-testid="recipient">
      {actorId}:{initialInvitationToken ?? "none"}
    </div>
  ),
}));
vi.mock("../../lib/coaching/invitation-handoff", () => ({
  takeOrganizationInvitationHandoffFromWindow: takeHandoff,
}));

import { Route } from "./organization-invitations";

afterEach(() => {
  cleanup();
  state.authUserId = "actor-one";
  takeHandoff.mockClear();
});
describe("recipient invitation route composition", () => {
  const Page = (Route as unknown as { component: ComponentType }).component;
  it("uses and updates the protected request identity", () => {
    const view = render(<Page />);
    expect(screen.getByTestId("recipient").textContent).toContain("actor-one");
    state.authUserId = "actor-two";
    view.rerender(<Page />);
    expect(screen.getByTestId("recipient").textContent).toContain("actor-two");
  });
  it("does not mount a recipient surface without protected identity", () => {
    state.authUserId = undefined;
    render(<Page />);
    expect(screen.queryByTestId("recipient")).toBeNull();
    expect(takeHandoff).not.toHaveBeenCalled();
  });
  it("waits for the first protected identity before consuming the handoff", () => {
    state.authUserId = undefined;
    const view = render(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    expect(takeHandoff).not.toHaveBeenCalled();
    state.authUserId = "actor-one";
    view.rerender(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    expect(takeHandoff).toHaveBeenCalledOnce();
    expect(screen.getByTestId("recipient").textContent).toContain("actor-one:a");
  });
  it("consumes a handoff once under StrictMode and never reinjects it after an actor switch", () => {
    const view = render(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    expect(takeHandoff).toHaveBeenCalledOnce();
    expect(screen.getByTestId("recipient").textContent).toContain("actor-one:a");
    state.authUserId = "actor-two";
    view.rerender(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    expect(screen.getByTestId("recipient").textContent).toBe("actor-two:none");
  });
});
