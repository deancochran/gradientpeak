import { executableIntegrationProviderIdSchema } from "@repo/core";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ZodError, z } from "zod";
import { getSafeAppRedirectTarget } from "../app-url";
import { createServerActionCaller } from "../server-action-api";
import { buildOnboardingDraftDefaults } from "./draft-defaults";
import { parseOnboardingFormData } from "./form-data";
import { getOnboardingIntegrationsLoadState } from "./integration-load-state";

function getSafeOnboardingErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Review the setup values and try again.";
  }
  return "Unable to complete setup. Please try again.";
}

function isPendingOAuthError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "data" in error &&
      (error as { data?: { applicationErrorCode?: unknown } }).data?.applicationErrorCode ===
        "ONBOARDING_PENDING_OAUTH",
  );
}

function validateFormData(data: unknown): FormData {
  if (!(data instanceof FormData)) throw new Error("Expected onboarding form data");
  return data;
}

export const loadOnboardingOptions = createServerFn({ method: "GET" }).handler(async () => {
  const caller = await createServerActionCaller();
  const profile = await caller.profiles.get().catch(() => null);
  const [progress, integrations, invitations, groups, people, settings, metrics, goals] =
    await Promise.allSettled([
      caller.onboarding.getProgress(),
      caller.integrations.getSyncOverview(),
      caller.groups.myInvitations({ limit: 5 }),
      caller.groups.listDiscoverable({ limit: 5 }),
      caller.social.searchUsers({ limit: 5 }),
      profile
        ? caller.profileSettings.getForProfile({ profile_id: profile.id })
        : Promise.resolve(null),
      caller.profileMetrics.list({ limit: 50 }),
      profile
        ? caller.goals.list({ profile_id: profile.id, limit: 10 })
        : Promise.resolve({ items: [] }),
    ]);
  const savedSettings = settings.status === "fulfilled" ? settings.value?.settings : undefined;
  const savedMetrics = metrics.status === "fulfilled" ? metrics.value.items : [];
  const savedGoal = goals.status === "fulfilled" ? goals.value.items[0] : undefined;
  const integrationsState = getOnboardingIntegrationsLoadState(integrations);

  return {
    profile,
    draft: profile
      ? buildOnboardingDraftDefaults({
          profile,
          metrics: savedMetrics,
          ...(savedSettings ? { settings: savedSettings } : null),
          ...(savedGoal
            ? {
                goal: {
                  ...savedGoal,
                  target_payload: savedGoal.target_payload as Record<
                    string,
                    string | number | boolean | null | undefined
                  >,
                },
              }
            : null),
        })
      : null,
    progress: progress.status === "fulfilled" ? progress.value : null,
    progressError:
      progress.status === "rejected"
        ? "Preparation progress could not be refreshed. Your work is still saved; try again."
        : null,
    integrationsError: integrationsState.integrationsError,
    setupData:
      integrations.status === "fulfilled"
        ? (integrations.value.find(
            (item) =>
              item.connected &&
              item.onboarding.evidence.profileDetails &&
              Object.keys(item.setupData.sources).length > 0,
          )?.setupData ??
          integrations.value.find(
            (item) => item.connected && item.onboarding.evidence.profileDetails,
          )?.setupData ??
          null)
        : null,
    integrations: integrationsState.integrations,
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
  } as const;
});

export const loadOnboardingProgress = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return {
      progress: await (await createServerActionCaller()).onboarding.getProgress(),
      error: null,
    } as const;
  } catch {
    return {
      progress: null,
      error: "Preparation progress could not be refreshed. Your work is still saved; try again.",
    } as const;
  }
});

export const completeOnboardingIdentityAction = createServerFn({ method: "POST" })
  .validator(validateFormData)
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

      if (!parsed.goal) {
        return {
          message: "Add a complete initial goal before finalizing.",
          status: "error" as const,
        };
      }
      await caller.onboarding.completeLifecycleSetup({
        profile: parsed.profile,
        goal: parsed.goal,
        ...(parsed.settings_patch ? { settings_patch: parsed.settings_patch } : null),
      });

      // Public/social effects are intentionally deferred until lifecycle finalization succeeds.
      await Promise.allSettled([
        ...parsed.social.invitationIds.map((invitationId) =>
          caller.groups.acceptInvite({ invitationId }),
        ),
        ...parsed.social.groupIds.map((groupId) => caller.groups.joinOrRequest({ groupId })),
        ...parsed.social.followProfileIds.map((target_user_id) =>
          caller.social.followUser({ target_user_id }),
        ),
      ]);
    } catch (error) {
      return { message: getSafeOnboardingErrorMessage(error), status: "error" as const };
    }

    throw redirect({ href: fallback, statusCode: 303 });
  });

export const saveOnboardingDraftAction = createServerFn({ method: "POST" })
  .validator(validateFormData)
  .handler(async ({ data }) => {
    try {
      const parsed = parseOnboardingFormData(data);
      await (await createServerActionCaller()).onboarding.saveDraft({ profile: parsed.profile });
      return { status: "saved" as const };
    } catch (error) {
      return { message: getSafeOnboardingErrorMessage(error), status: "error" as const };
    }
  });

export const startOnboardingProcessingAction = createServerFn({ method: "POST" }).handler(
  async () => {
    try {
      return await (await createServerActionCaller()).onboarding.startProcessing();
    } catch (error) {
      return {
        code: isPendingOAuthError(error) ? ("pending_oauth" as const) : ("unknown" as const),
        message: getSafeOnboardingErrorMessage(error),
        status: "error" as const,
      };
    }
  },
);

const providerActionInputSchema = z
  .object({ provider: executableIntegrationProviderIdSchema })
  .strict();

export const retryOnboardingProviderAction = createServerFn({ method: "POST" })
  .validator((data: unknown) => providerActionInputSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      return await (await createServerActionCaller()).onboarding.retryProviderProcessing({
        provider: data.provider,
      });
    } catch (error) {
      return { message: getSafeOnboardingErrorMessage(error), status: "error" as const };
    }
  });

export const restartOnboardingProviderSelectionAction = createServerFn({ method: "POST" }).handler(
  async () => {
    try {
      return await (await createServerActionCaller()).onboarding.restartProviderSelection();
    } catch (error) {
      return { message: getSafeOnboardingErrorMessage(error), status: "error" as const };
    }
  },
);

export const cancelPendingOnboardingOAuthAction = createServerFn({ method: "POST" })
  .validator((data: unknown) => providerActionInputSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      return await (await createServerActionCaller()).integrations.cancelPendingOAuth({
        provider: data.provider,
      });
    } catch (error) {
      return { message: getSafeOnboardingErrorMessage(error), status: "error" as const };
    }
  });
