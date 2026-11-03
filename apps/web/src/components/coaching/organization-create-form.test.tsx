// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: mocks.invalidate, navigate: mocks.navigate }),
}));

vi.mock("../../lib/coaching/server-functions", () => ({
  createCoachingOrganization: mocks.create,
}));

import { OrganizationCreateForm } from "./organization-create-form";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.create.mockReset();
  mocks.invalidate.mockReset();
  mocks.navigate.mockReset();
});

describe("OrganizationCreateForm", () => {
  it("retries an uncertain submission with the same organization ID and blocks changed details until a new draft is explicit", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce(firstId).mockReturnValue(secondId),
    });
    mocks.create
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({ organizationId: firstId });
    render(<OrganizationCreateForm />);

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));

    await screen.findByRole("alert");
    expect(mocks.create).toHaveBeenLastCalledWith({
      data: {
        organizationId: firstId,
        name: "Summit Coaching",
        slug: "summit-coaching",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      },
    });

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Changed Coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Check your organizations/),
    );

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: firstId }) }),
    );
  });
});
