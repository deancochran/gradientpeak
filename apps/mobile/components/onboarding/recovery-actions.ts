import type { OnboardingStatusModal } from "./types";

export async function runOnboardingRecoveryAction(input: {
  action: () => Promise<unknown>;
  setStatusModal: (modal: OnboardingStatusModal) => void;
  failure: OnboardingStatusModal;
}) {
  try {
    await input.action();
    return true;
  } catch {
    input.setStatusModal(input.failure);
    return false;
  }
}
