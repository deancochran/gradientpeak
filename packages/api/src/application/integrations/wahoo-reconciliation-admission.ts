import {
  isProviderActivityHistoryReconciliationTarget,
  type ProviderCapability,
  providerHasCapability,
} from "@repo/core";
import { isWahooIntegrationEnabled } from "../../lib/integrations/oauth-config";

export type WahooReconciliationTarget = "activity_history" | "profile_enrichment";
export type WahooReconciliationTrigger = "connect" | "manual";

type WahooIntegrationCandidate = {
  generation: number;
  id: string;
  lifecycle_status: string;
  profile_id: string;
  provider: string;
};

const targetPolicy = {
  activity_history: {
    capabilities: ["activity_history_read", "activity_file_download"],
    scopes: ["workouts_read", "offline_data"],
  },
  profile_enrichment: {
    capabilities: ["profile_enrichment_read"],
    scopes: ["user_read"],
  },
} as const satisfies Record<
  WahooReconciliationTarget,
  { capabilities: readonly ProviderCapability[]; scopes: readonly string[] }
>;

export type WahooReconciliationAdmission =
  | {
      admitted: true;
      generation: number;
      integrationId: string;
      profileId: string;
      target: WahooReconciliationTarget;
      trigger: WahooReconciliationTrigger;
    }
  | {
      admitted: false;
      reason:
        | "integration_inactive"
        | "invalid_generation"
        | "missing_scope"
        | "runtime_disabled"
        | "static_target_unsupported"
        | "wrong_provider";
      target: WahooReconciliationTarget;
      trigger: WahooReconciliationTrigger;
    };

function grantedScopes(scope: string | null | undefined): Set<string> {
  return new Set((scope ?? "").split(/[\s,]+/).filter(Boolean));
}

/**
 * Sole admission decision for Wahoo history/profile reconciliation. Core owns the
 * static capability target; API adds runtime configuration, grant, lifecycle, and
 * generation fences before any durable job is admitted.
 */
export function admitWahooReconciliation(input: {
  env?: Record<string, string | undefined>;
  integration: WahooIntegrationCandidate;
  scope: string | null | undefined;
  target: WahooReconciliationTarget;
  trigger: WahooReconciliationTrigger;
}): WahooReconciliationAdmission {
  const base = { target: input.target, trigger: input.trigger } as const;
  if (!isWahooIntegrationEnabled(input.env)) {
    return { ...base, admitted: false, reason: "runtime_disabled" };
  }
  if (input.integration.provider !== "wahoo") {
    return { ...base, admitted: false, reason: "wrong_provider" };
  }
  if (input.integration.lifecycle_status !== "active") {
    return { ...base, admitted: false, reason: "integration_inactive" };
  }
  if (!Number.isSafeInteger(input.integration.generation) || input.integration.generation < 1) {
    return { ...base, admitted: false, reason: "invalid_generation" };
  }

  const policy = targetPolicy[input.target];
  const staticallySupported =
    input.target === "activity_history"
      ? isProviderActivityHistoryReconciliationTarget("wahoo")
      : policy.capabilities.every((capability) => providerHasCapability("wahoo", capability));
  if (!staticallySupported) {
    return { ...base, admitted: false, reason: "static_target_unsupported" };
  }
  const scopes = grantedScopes(input.scope);
  if (!policy.scopes.every((scope) => scopes.has(scope))) {
    return { ...base, admitted: false, reason: "missing_scope" };
  }

  return {
    ...base,
    admitted: true,
    generation: input.integration.generation,
    integrationId: input.integration.id,
    profileId: input.integration.profile_id,
  };
}
