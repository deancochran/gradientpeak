// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => load }));
vi.mock("../../../lib/coaching/athletes-server-functions", () => ({
  loadAssignedCoachAthletes: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: ReactNode; params: { athleteId: string } }) => (
    <a href={`/${params.athleteId}`}>{children}</a>
  ),
}));

import { AthleteWorkspaceSwitcher } from "./athlete-workspace-switcher";

const selected = {
  profileId: "selected",
  displayName: "Selected athlete outside page",
  username: "selected",
};
const initial = {
  status: "granted" as const,
  items: [{ profileId: "other", displayName: "Other athlete", username: "other" }],
  nextCursor: "other",
  hasMore: true,
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("keeps exact selected identity outside the first page, after filtering and failed search retry", async () => {
  load
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ status: "granted", items: [], nextCursor: null, hasMore: false });
  render(
    <AthleteWorkspaceSwitcher
      organizationId="org"
      athleteId="selected"
      selectedAthlete={selected}
      initialPage={initial}
    />,
  );
  expect(screen.getByRole("heading", { name: selected.displayName })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Switch athlete/ }));
  fireEvent.change(screen.getByLabelText("Search assigned athletes"), {
    target: { value: "Unmatched" },
  });
  expect(screen.getByRole("button", { name: "Next page" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
  await screen.findByText("No assigned athletes match this search.");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("heading", { name: selected.displayName })).toBeTruthy();
  expect(load).toHaveBeenLastCalledWith({
    data: { organizationId: "org", limit: 20, cursor: null, search: "Unmatched" },
  });
});
it("discards old-organization in-flight identities when the same athlete context changes", async () => {
  let resolve!: (value: unknown) => void;
  load.mockReturnValue(
    new Promise((result) => {
      resolve = result;
    }),
  );
  const view = render(
    <AthleteWorkspaceSwitcher
      organizationId="old"
      athleteId="selected"
      selectedAthlete={selected}
      initialPage={initial}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Switch athlete/ }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => expect(load).toHaveBeenCalled());
  view.rerender(
    <AthleteWorkspaceSwitcher
      organizationId="new"
      athleteId="selected"
      selectedAthlete={selected}
      initialPage={{ status: "granted", items: [], nextCursor: null, hasMore: false }}
    />,
  );
  await act(async () =>
    resolve({
      status: "granted",
      items: [
        { profileId: "private", displayName: "Old organization private identity", username: null },
      ],
      nextCursor: null,
      hasMore: false,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Switch athlete/ }));
  expect(screen.queryByText("Old organization private identity")).toBeNull();
  expect(screen.queryByText("Other athlete")).toBeNull();
});
