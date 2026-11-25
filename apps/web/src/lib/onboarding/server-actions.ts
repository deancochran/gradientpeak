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
  const [progress, integrations] = await Promise.allSettled([
    caller.onboarding.getProgress(),
    caller.integrations.getSyncOverview(),
  ]);
  const integrationsState = getOnboardingIntegrationsLoadState(integrations);

  return {
    profile,
    draft: profile ? buildOnboardingDraftDefaults({ profile }) : null,
    progress: progress.status === "fulfilled" ? progress.value : null,
    progressError:
      progress.status === "rejected"
        ? "Preparation progress could not be refreshed. Your work is still saved; try again."
        : null,
    integrationsError: integrationsState.integrationsError,
    integrations: integrationsState.integrations,
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

      await caller.onboarding.completeLifecycleSetup({
        profile: parsed.profile,
      });
    } catch (error) {
      return {
        ...(isPendingOAuthError(error) ? { code: "pending_oauth" as const } : null),
        message: isPendingOAuthError(error)
          ? "Finish or cancel the pending provider connection before continuing."
          : getSafeOnboardingErrorMessage(error),
        status: "error" as const,
      };
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
