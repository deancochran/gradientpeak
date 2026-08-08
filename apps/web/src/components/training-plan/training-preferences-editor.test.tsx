// @vitest-environment jsdom

import { defaultAthletePreferenceProfile } from "@repo/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrainingPreferencesEditor } from "./training-preferences-editor";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const mocks = vi.hoisted(() => ({
  invalidateProfile: vi.fn(),
  invalidatePlans: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({
      profileSettings: { getForProfile: { invalidate: mocks.invalidateProfile } },
      trainingPlans: { invalidate: mocks.invalidatePlans },
    }),
    profiles: {
      get: {
        useQuery: () => ({
          data: { id: PROFILE_ID },
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
    },
    profileSettings: {
      getForProfile: {
        useQuery: () => ({
          data: { profile_id: PROFILE_ID, settings: defaultAthletePreferenceProfile },
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      upsert: {
        useMutation: () => ({ isError: false, isPending: false, mutateAsync: mocks.save }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TrainingPreferencesEditor", () => {
  it("hydrates persisted settings and retains a validated draft for retry", async () => {
    const saved = {
      ...defaultAthletePreferenceProfile,
      dose_limits: {
        ...defaultAthletePreferenceProfile.dose_limits,
        max_sessions_per_week: 5,
      },
    };
    mocks.save
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ settings: saved });
    render(<TrainingPreferencesEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    const maxSessions = await screen.findByTestId("training-preferences-max-sessions-per-week");
    expect((maxSessions as HTMLInputElement).value).toBe("4");
    fireEvent.change(maxSessions, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    expect((await screen.findByRole("alert")).textContent).toContain("offline");
    expect((maxSessions as HTMLInputElement).value).toBe("5");
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Training preferences saved.")).toBeTruthy();
    expect(mocks.save).toHaveBeenLastCalledWith({
      profile_id: PROFILE_ID,
      settings: expect.objectContaining({
        dose_limits: expect.objectContaining({ max_sessions_per_week: 5 }),
      }),
    });
  });
});
