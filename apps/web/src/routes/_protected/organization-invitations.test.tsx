// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authUserId: "actor-one" as string | undefined }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useRouteContext: () => ({ authUserId: state.authUserId }),
  }),
}));
vi.mock("../../components/coaching/invitation-response/invitation-response", () => ({
  InvitationResponse: ({ actorId }: { actorId: string }) => (
    <div data-testid="recipient">{actorId}</div>
  ),
}));

import { Route } from "./organization-invitations";

afterEach(() => {
  cleanup();
  state.authUserId = "actor-one";
});
describe("recipient invitation route composition", () => {
  const Page = (Route as unknown as { component: ComponentType }).component;
  it("uses and updates the protected request identity", () => {
    const view = render(<Page />);
    expect(screen.getByTestId("recipient").textContent).toBe("actor-one");
    state.authUserId = "actor-two";
    view.rerender(<Page />);
    expect(screen.getByTestId("recipient").textContent).toBe("actor-two");
  });
  it("does not mount a recipient surface without protected identity", () => {
    state.authUserId = undefined;
    render(<Page />);
    expect(screen.queryByTestId("recipient")).toBeNull();
  });
});
