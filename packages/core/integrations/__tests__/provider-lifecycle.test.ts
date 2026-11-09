import { describe, expect, it } from "vitest";
import {
  decideRemoteSourceCanonicalAction,
  providerIntegrationLifecycleStatusSchema,
} from "../provider-lifecycle";

describe("provider lifecycle contracts", () => {
  it.each([
    "active",
    "disconnect_pending",
    "disconnected",
  ])("accepts the %s lifecycle state", (status) => {
    expect(providerIntegrationLifecycleStatusSchema.parse(status)).toBe(status);
  });

  it.each([
    [{ hasAcceptedArtifactEvidence: true, hasOtherConfirmedSource: false }, "retain"],
    [{ hasAcceptedArtifactEvidence: false, hasOtherConfirmedSource: true }, "retain"],
    [{ hasAcceptedArtifactEvidence: false, hasOtherConfirmedSource: false }, "delete"],
  ] as const)("derives canonical activity handling from represented support", (support, expected) => {
    expect(decideRemoteSourceCanonicalAction(support)).toBe(expected);
  });
});
