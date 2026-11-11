// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  grant: vi.fn(),
  invalidate: vi.fn(),
  revoke: vi.fn(),
}));

const option = {
  organization: { id: "11111111-1111-4111-8111-111111111111", name: "Peak Coaching" },
  coach: { membershipId: "22222222-2222-4222-8222-222222222222", name: "Avery Coach" },
  currentGrant: null as { id: string } | null,
};

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({
      coachingPublication: { permissionOptions: { invalidate: mocks.invalidate } },
    }),
    coachingPublication: {
      permissionOptions: { useQuery: () => ({ data: { options: [option] }, isLoading: false }) },
      grant: { useMutation: () => ({ isPending: false, mutateAsync: mocks.grant }) },
      revoke: { useMutation: () => ({ isPending: false, mutateAsync: mocks.revoke }) },
    },
  },
}));

import { AthleteWorkoutPublicationPermissions } from "./athlete-workout-publication-permissions";

afterEach(() => {
  cleanup();
  mocks.grant.mockReset();
  mocks.invalidate.mockReset();
  mocks.revoke.mockReset();
  option.currentGrant = null;
});

describe("AthleteWorkoutPublicationPermissions", () => {
  it("grants the selected assigned coach write permission and refreshes authoritative status", async () => {
    mocks.grant.mockResolvedValue({ grant: { id: "33333333-3333-4333-8333-333333333333" } });
    mocks.invalidate.mockResolvedValue(undefined);
    render(<AthleteWorkoutPublicationPermissions />);

    expect(
      screen.getByText(/write permission, separate from any read-only coaching consent/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Allow Avery Coach to publish workouts"));

    await waitFor(() =>
      expect(mocks.grant).toHaveBeenCalledWith({
        organizationId: option.organization.id,
        coachMembershipId: option.coach.membershipId,
      }),
    );
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    expect(screen.getByRole("status").textContent).toMatch(/can now publish workouts/i);
  });

  it("revokes the current write permission without exposing an identifier field", async () => {
    option.currentGrant = { id: "33333333-3333-4333-8333-333333333333" };
    mocks.revoke.mockResolvedValue({ revoked: true });
    mocks.invalidate.mockResolvedValue(undefined);
    render(<AthleteWorkoutPublicationPermissions />);

    fireEvent.click(screen.getByLabelText("Allow Avery Coach to publish workouts"));

    await waitFor(() =>
      expect(mocks.revoke).toHaveBeenCalledWith({ grantId: option.currentGrant?.id }),
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("refreshes after a repeated revoke reports no active permission", async () => {
    option.currentGrant = { id: "33333333-3333-4333-8333-333333333333" };
    mocks.revoke.mockRejectedValue({ data: { code: "NOT_FOUND" } });
    mocks.invalidate.mockResolvedValue(undefined);
    render(<AthleteWorkoutPublicationPermissions />);

    fireEvent.click(screen.getByLabelText("Allow Avery Coach to publish workouts"));

    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    expect(screen.getByRole("status").textContent).toMatch(
      /no active workout publishing permission/i,
    );
  });
});
