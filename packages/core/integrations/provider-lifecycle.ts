import { z } from "zod";

export const providerIntegrationLifecycleStatusValues = [
  "active",
  "disconnect_pending",
  "disconnected",
] as const;
export const providerIntegrationLifecycleStatusSchema = z.enum(
  providerIntegrationLifecycleStatusValues,
);
export type ProviderIntegrationLifecycleStatus = z.infer<
  typeof providerIntegrationLifecycleStatusSchema
>;

export const providerDisconnectOutcomeSchema = z.enum(["confirmed", "retry", "dead_lettered"]);
export type ProviderDisconnectOutcome = z.infer<typeof providerDisconnectOutcomeSchema>;

/** Shared lifecycle policy; adapters retain ownership of remote revocation protocol calls. */
export const PROVIDER_DISCONNECT_POLICY = {
  disabledRuntime: "local_disconnect_delete_credentials",
  enabledRuntime: "fence_then_confirm_remote_revoke",
  sourceReferences: "retain_import_identity",
  retainedData: ["activities", "profile", "source_references"] as const,
  terminalFailure: "retain_disconnect_pending_credentials_for_retry",
} as const;

export type CanonicalActivitySupport = {
  hasAcceptedArtifactEvidence: boolean;
  hasOtherConfirmedSource: boolean;
};

export function decideRemoteSourceCanonicalAction(
  support: CanonicalActivitySupport,
): "delete" | "retain" {
  return support.hasAcceptedArtifactEvidence || support.hasOtherConfirmedSource
    ? "retain"
    : "delete";
}
