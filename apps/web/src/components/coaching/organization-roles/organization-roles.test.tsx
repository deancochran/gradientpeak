// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), invalidate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/audit">{children}</a>,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("../../../lib/coaching/organization-roles-server-functions", () => ({
  submitOrganizationRoleCommand: mocks.submit,
}));

import { OrganizationRoles } from "./organization-roles";

const organizationId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";
const page = {
  items: [
    {
      membershipId,
      identity: { displayName: "Taylor Coach", username: "taylor" },
      roleKeys: ["coach" as const],
      actions: {
        grantAdmin: { eligible: false },
        revokeAdmin: { eligible: false },
        grantCoach: { eligible: true },
        revokeCoach: { eligible: true },
      },
    },
  ],
  nextCursor: null,
  hasMore: false,
};

function renderRoles() {
  return render(
    <OrganizationRoles actorProfileId="actor-1" organizationId={organizationId} page={page} />,
  );
}

async function previewCoachGrant() {
  fireEvent.change(screen.getByLabelText("Staff member"), { target: { value: membershipId } });
  fireEvent.click(screen.getByRole("button", { name: "Preview role change" }));
  await screen.findByText("Confirm role change");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("OrganizationRoles", () => {
  it("does not offer a local admin grant when the server-provided eligibility denies it", () => {
    renderRoles();
    fireEvent.change(screen.getByLabelText("Staff member"), { target: { value: membershipId } });
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));

    expect(
      screen.getByRole("button", { name: "Preview role change" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText(/unavailable for your current role/i)).toBeTruthy();
  });

  it("keeps selected and unselected fixed-role controls legible on the slate surface", () => {
    renderRoles();

    expect(screen.getByRole("button", { name: "Coach" }).className).toContain("bg-cyan-400");
    expect(screen.getByRole("button", { name: "Admin" }).className).toContain("bg-slate-900");
    expect(screen.getByRole("button", { name: "Admin" }).className).toContain("text-slate-100");
    expect(screen.getByRole("button", { name: "Grant" }).className).toContain("bg-cyan-400");
    expect(screen.getByRole("button", { name: "Revoke" }).className).toContain("bg-slate-900");
  });

  it("freezes the preview payload and retries exactly that operation after an unknown result", async () => {
    const operationId = "33333333-3333-4333-8333-333333333333";
    mocks.submit.mockRejectedValueOnce(new Error("network"));
    mocks.submit.mockResolvedValueOnce({
      membershipId,
      operationId,
      role: "coach",
      status: "granted",
    });
    vi.spyOn(crypto, "randomUUID").mockReturnValue(operationId);
    renderRoles();

    await previewCoachGrant();
    expect(screen.getByText("Current role").parentElement?.textContent).toContain("Includes Coach");
    fireEvent.click(screen.getByRole("button", { name: "Grant Coach role" }));
    await screen.findByText(/could not confirm whether this change completed/i);
    expect(screen.getByLabelText("Staff member").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Back to edit" }).hasAttribute("disabled")).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry same Grant Coach role" }));

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
    expect(mocks.submit.mock.calls[0]?.[0]).toEqual(mocks.submit.mock.calls[1]?.[0]);
    expect(mocks.submit.mock.calls[0]?.[0]).toMatchObject({
      organizationId,
      membershipId,
      operationId,
      role: "coach",
      mutation: "grant",
    });
  });

  it("explains assignment loss before a coach revocation is saved", async () => {
    renderRoles();
    fireEvent.change(screen.getByLabelText("Staff member"), { target: { value: membershipId } });
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview role change" }));

    expect(
      await screen.findByText(/ends existing direct and group coaching assignments/i),
    ).toBeTruthy();
    expect(screen.queryByText(/affected count/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to edit" }).className).toContain(
      "bg-slate-900",
    );
  });

  it("invalidates a preview when the actor scope changes", async () => {
    const view = renderRoles();
    await previewCoachGrant();
    expect(screen.getByText("Confirm role change")).toBeTruthy();

    view.rerender(
      <OrganizationRoles actorProfileId="actor-2" organizationId={organizationId} page={page} />,
    );

    expect(screen.queryByText("Confirm role change")).toBeNull();
  });

  it("keeps a confirmed mutation distinct from a failed roster refresh", async () => {
    const operationId = "44444444-4444-4444-8444-444444444444";
    mocks.submit.mockResolvedValue({ membershipId, operationId, role: "coach", status: "granted" });
    mocks.invalidate.mockRejectedValueOnce(new Error("refresh failed"));
    vi.spyOn(crypto, "randomUUID").mockReturnValue(operationId);
    renderRoles();

    await previewCoachGrant();
    fireEvent.click(screen.getByRole("button", { name: "Grant Coach role" }));
    await screen.findByText(/role change was confirmed, but the staff roster could not refresh/i);

    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Confirm role change")).toBeNull();
    expect(screen.queryByLabelText("Staff member")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh staff roster" }));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(2));
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("explains an empty authorized page and sends the user to the Staff roster", () => {
    render(
      <OrganizationRoles
        actorProfileId="actor-1"
        organizationId={organizationId}
        page={{ items: [], nextCursor: null, hasMore: false }}
      />,
    );

    expect(screen.getByText(/no active staff are available on this authorized page/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Staff roster" })).toBeTruthy();
  });
});
