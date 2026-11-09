export type IntegrationOAuthCallbackOutcome = {
  description: string;
  status: "connected" | "failed";
  title: "Connected" | "Issue";
};

const callbackErrorMessages: Readonly<Record<string, string>> = {
  authorization_denied: "Authorization was cancelled or denied.",
  database_error: "Could not save the connection.",
  disconnect_in_progress: "Disconnect is still finishing. Try again shortly.",
  integration_state_changed: "The integration changed during setup. Refresh and try again.",
  invalid_provider: "Provider unavailable.",
  invalid_state: "Session expired. Try again.",
  missing_code: "Authorization was incomplete.",
  provider_identity_failed: "Could not verify the provider account.",
  server_error: "Server error. Try again.",
  store_integration_failed: "Could not save the connection.",
  token_exchange_failed:
    "The provider rejected the connection. Check its app access and try again.",
  wahoo_token_limit_exceeded:
    "Wahoo has too many active GradientPeak authorizations. Revoke GradientPeak in your Wahoo account, then try again.",
};

export function parseIntegrationOAuthCallback(
  urlValue: string,
): IntegrationOAuthCallbackOutcome | null {
  const url = new URL(urlValue);
  if (
    url.searchParams.get("success") === "true" ||
    url.searchParams.get("integration") === "connected"
  ) {
    return {
      description: "Integration connected.",
      status: "connected",
      title: "Connected",
    };
  }

  const error = url.searchParams.get("error");
  if (!error) return null;
  return {
    description: callbackErrorMessages[error] ?? "Connection failed. Try again.",
    status: "failed",
    title: "Issue",
  };
}
