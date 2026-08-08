import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ZodError } from "zod";
import { getSafeAppRedirectTarget } from "../app-url";
import { createServerActionCaller } from "../server-action-api";
import { parseOnboardingFormData } from "./form-data";

function getSafeOnboardingErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Review the setup values and try again.";
  }
  return "Unable to complete setup. Please try again.";
}

export const loadOnboardingOptions = createServerFn({ method: "GET" }).handler(async () => {
  const caller = await createServerActionCaller();
  const [integrations, invitations, groups, people] = await Promise.allSettled([
    caller.integrations.getSyncOverview(),
    caller.groups.myInvitations({ limit: 5 }),
    caller.groups.listDiscoverable({ limit: 5 }),
    caller.social.searchUsers({ limit: 5 }),
  ]);

  return {
    imported:
      integrations.status === "fulfilled" && integrations.value[0]
        ? {
            profile: integrations.value[0].setupData.profile,
            sources: integrations.value[0].setupData.sources,
            values: integrations.value[0].setupData.values,
          }
        : null,
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
    return data;
  })
  .handler(async ({ data }) => {
    let parsed: ReturnType<typeof parseOnboardingFormData>;
    try {
      parsed = parseOnboardingFormData(data);
    } catch (error) {
      return { message: getSafeOnboardingErrorMessage(error), status: "error" as const };
    }

    const fallback = getSafeAppRedirectTarget(parsed.redirect, "/");
    try {
      const caller = await createServerActionCaller();

      // Optional relationship actions happen before the profile is marked complete so failures
      // remain recoverable on this route. The procedures are idempotent for already-saved choices.
      for (const invitationId of parsed.social.invitationIds) {
        await caller.groups.acceptInvite({ invitationId });
      }
      for (const groupId of parsed.social.groupIds) {
        await caller.groups.joinOrRequest({ groupId });
      }
      for (const target_user_id of parsed.social.followProfileIds) {
        await caller.social.followUser({ target_user_id });
      }

      const result = await caller.onboarding.completeLifecycleSetup({
        profile: parsed.profile,
        ...(parsed.goal ? { goal: parsed.goal } : null),
        ...(parsed.settings_patch ? { settings_patch: parsed.settings_patch } : null),
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
      return { message: getSafeOnboardingErrorMessage(error), status: "error" as const };
    }

    throw redirect({ href: fallback, statusCode: 303 });
  });
