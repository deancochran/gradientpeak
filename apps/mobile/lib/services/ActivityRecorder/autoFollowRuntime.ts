import type { RecordingConfiguration } from "@repo/core";

export type AutoFollowAuthority = "plan_targets" | "route_simulation";

export function shouldApplyAutoFollowAuthority(
  configuration: RecordingConfiguration,
  authority: AutoFollowAuthority,
): boolean {
  const capabilities = configuration.capabilities;
  return capabilities.shouldAutoFollowTargets && capabilities.autoFollowPriority === authority;
}
