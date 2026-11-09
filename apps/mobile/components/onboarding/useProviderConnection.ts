import type { ExecutableIntegrationProviderId } from "@repo/core";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { api } from "@/lib/api";
import { parseIntegrationOAuthCallback } from "@/lib/integration-oauth-callback";
import { connectProductionMobileProvider } from "@/lib/integration-provider-actions";
import type { OnboardingStatusModal } from "./types";

function getMobileRedirectUri(): string {
  return Constants.expoConfig?.extra?.redirectUri ?? Linking.createURL("integrations");
}

export function useProviderConnection(input: {
  onConnected: () => unknown;
  setStatusModal: (modal: OnboardingStatusModal | null) => void;
}) {
  const [pendingProvider, setPendingProvider] = useState<ExecutableIntegrationProviderId | null>(
    null,
  );
  const getAuthUrlMutation = api.integrations.getAuthUrl.useMutation();

  const connect = async (provider: ExecutableIntegrationProviderId) => {
    setPendingProvider(provider);
    const redirectUri = getMobileRedirectUri();
    try {
      let url = "";
      await connectProductionMobileProvider(provider, {
        connectOAuth: async (connectorId) => {
          ({ url } = await getAuthUrlMutation.mutateAsync({ provider: connectorId, redirectUri }));
        },
      });
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
      if (result.type === "success") {
        const outcome = parseIntegrationOAuthCallback(result.url);
        if (outcome?.status === "connected") await input.onConnected();
        input.setStatusModal(
          outcome ?? {
            title: "Connection incomplete",
            description: "The authorization response was incomplete. Try again.",
          },
        );
      } else if (result.type === "cancel" || result.type === "dismiss") {
        input.setStatusModal({
          title: "Connection not completed",
          description: "The account was not connected. You can try again or continue without it.",
        });
      }
    } catch {
      input.setStatusModal({
        title: "Connection failed",
        description: "This account could not be connected. Check availability and try again.",
      });
    } finally {
      setPendingProvider(null);
    }
  };

  return { connect, pendingProvider };
}
