export function getOnboardingIntegrationsLoadState<T>(result: PromiseSettledResult<T[]>) {
  return result.status === "fulfilled"
    ? { integrations: result.value, integrationsError: null }
    : {
        integrations: [] as T[],
        integrationsError: "Available training accounts could not be loaded. Try again.",
      };
}
