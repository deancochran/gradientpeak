const safeOnboardingOAuthErrors = new Set([
  "authorization_denied",
  "invalid_state",
  "missing_code",
  "token_exchange_failed",
  "provider_identity_failed",
  "store_integration_failed",
  "wahoo_token_limit_exceeded",
  "disconnect_in_progress",
  "integration_state_changed",
]);

export function parseOnboardingOAuthError(value: unknown) {
  return typeof value === "string" && safeOnboardingOAuthErrors.has(value) ? value : undefined;
}

export function getOnboardingOAuthErrorMessage(error?: string) {
  if (!error) return null;
  return error === "authorization_denied"
    ? "Wahoo authorization was cancelled or denied. Try connecting again, or continue without Wahoo."
    : "Wahoo could not be connected safely. Try again, cancel the pending connection if needed, or continue without Wahoo.";
}
