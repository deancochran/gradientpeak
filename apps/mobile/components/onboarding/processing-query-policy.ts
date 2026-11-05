export function onboardingProgressRefetchInterval(input: { phase?: string; status?: string }) {
  return input.status === "processing" ? 2000 : false;
}

export function onboardingOverviewEnabled(input: {
  authenticated: boolean;
  status: string | null | undefined;
}) {
  return (
    input.authenticated && (input.status === "provider_selection" || input.status === "review")
  );
}
