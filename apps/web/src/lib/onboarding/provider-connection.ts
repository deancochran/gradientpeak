export async function startOnboardingProviderConnection<TProvider extends string>(input: {
  provider: TProvider;
  redirectUri: string;
  getAuthUrl: (request: { provider: TProvider; redirectUri: string }) => Promise<{ url: string }>;
  navigate: (url: string) => void;
  onError: (message: string) => void;
}) {
  try {
    const result = await input.getAuthUrl({
      provider: input.provider,
      redirectUri: input.redirectUri,
    });
    input.navigate(result.url);
    return true;
  } catch {
    input.onError("Unable to start this connection. Check provider availability and try again.");
    return false;
  }
}
