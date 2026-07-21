import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSafeAppRedirectTarget } from "../app-url";
import { createServerActionCaller } from "../server-action-api";
import { parseOnboardingFormData } from "./form-data";

function errorRedirect(error: unknown, redirectTo?: string): never {
  const search = new URLSearchParams({
    flash: error instanceof Error ? error.message : "Unable to complete setup",
    flashType: "error",
  });
  if (redirectTo) search.set("redirect", redirectTo);
  throw redirect({ href: `/onboarding?${search.toString()}`, statusCode: 303 });
}

export const loadOnboardingOptions = createServerFn({ method: "GET" }).handler(async () => {
  const caller = await createServerActionCaller();
  const [imported, integrations, invitations, groups, people] = await Promise.allSettled([
    caller.onboarding.getImportedOnboardingValues(),
    caller.integrations.getSyncOverview(),
    caller.groups.myInvitations({ limit: 5 }),
    caller.groups.listDiscoverable({ limit: 5 }),
    caller.social.searchUsers({ limit: 5 }),
  ]);

  return {
    imported: imported.status === "fulfilled" ? imported.value : null,
    integrations:
      integrations.status === "fulfilled"
        ? integrations.value.map((item) => ({
            provider: item.provider,
            connected: item.connected,
            status: item.summary.health,
          }))
        : [],
    invitations:
      invitations.status === "fulfilled"
        ? invitations.value.items.map((item) => ({ id: item.id, name: item.group.name }))
        : [],
    groups:
      groups.status === "fulfilled"
        ? groups.value.items
            .filter((item) => item.viewer.canJoin || item.viewer.canRequestToJoin)
            .map((item) => ({
              id: item.id,
              name: item.name,
              action: item.viewer.canJoin ? "Join" : "Request to join",
            }))
        : [],
    people:
      people.status === "fulfilled"
        ? people.value.users
            .filter((item) => item.follow_status !== "accepted" && item.follow_status !== "pending")
            .map((item) => ({
              id: item.id,
              name: item.full_name ?? item.username ?? "Athlete",
              username: item.username ?? "athlete",
            }))
        : [],
  };
});

export const completeOnboardingIdentityAction = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected onboarding form data");
    return parseOnboardingFormData(data);
  })
  .handler(async ({ data }) => {
    const fallback = getSafeAppRedirectTarget(data.redirect, "/");
    try {
      const caller = await createServerActionCaller();

      // Optional relationship actions happen before the profile is marked complete so failures
      // remain recoverable on this route. The procedures are idempotent for already-saved choices.
      for (const invitationId of data.social.invitationIds) {
        await caller.groups.acceptInvite({ invitationId });
      }
      for (const groupId of data.social.groupIds) {
        await caller.groups.joinOrRequest({ groupId });
      }
      for (const target_user_id of data.social.followProfileIds) {
        await caller.social.followUser({ target_user_id });
      }

      const result = await caller.onboarding.completeLifecycleSetup({
        profile: data.profile,
        ...(data.goal ? { goal: data.goal } : null),
        ...(data.settings_patch ? { settings_patch: data.settings_patch } : null),
      });
      const failed = [
        result.goal.status === "failed" ? "goal" : null,
        result.settings.status === "failed" ? "training preferences" : null,
      ].filter(Boolean);
      if (failed.length > 0) {
        throw new Error(
          `Profile saved, but ${failed.join(" and ")} could not be saved. Retry setup.`,
        );
      }
    } catch (error) {
      errorRedirect(error, data.redirect);
    }

    throw redirect({ href: fallback, statusCode: 303 });
  });
