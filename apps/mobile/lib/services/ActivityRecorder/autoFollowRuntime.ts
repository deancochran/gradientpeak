import type { RecordingConfiguration } from "@repo/core";

export type AutoFollowAuthority = "plan_targets" | "route_simulation";

export function shouldApplyAutoFollowAuthority(
  configuration: RecordingConfiguration,
  authority: AutoFollowAuthority,
): boolean {
  return (
    configuration.capabilities.shouldAutoFollowTargets &&
    configuration.capabilities.autoFollowPriority === authority
  );
}
