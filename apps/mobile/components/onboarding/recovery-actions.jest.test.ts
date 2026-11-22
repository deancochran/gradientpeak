import { runOnboardingRecoveryAction } from "./recovery-actions";

describe("onboarding recovery actions", () => {
  it.each([
    ["retry", "Preparation could not be retried"],
    ["restart", "Account selection could not be reopened"],
  ])("shows safe %s failure feedback and settles for another tap", async (_kind, title) => {
    const setStatusModal = jest.fn();
    const action = jest.fn().mockRejectedValue(new Error("private server detail"));
    const failure = { title, description: "Try again in a moment." };

    await expect(runOnboardingRecoveryAction({ action, failure, setStatusModal })).resolves.toBe(
      false,
    );
    expect(setStatusModal).toHaveBeenCalledWith(failure);
    action.mockResolvedValueOnce(undefined);
    await expect(runOnboardingRecoveryAction({ action, failure, setStatusModal })).resolves.toBe(
      true,
    );
    expect(action).toHaveBeenCalledTimes(2);
  });
});
