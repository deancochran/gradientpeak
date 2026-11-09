import { setResponseHeader } from "@tanstack/react-start/server";

type EmailSignInApi = {
  signInEmail: (input: {
    body: { email: string; password: string };
    returnHeaders: true;
  }) => Promise<{ headers: Headers }>;
};

export async function signInWithEmailAndForwardSession(
  api: EmailSignInApi,
  credentials: { email: string; password: string },
) {
  const { headers } = await api.signInEmail({
    body: credentials,
    returnHeaders: true,
  });

  const cookieHeaders =
    (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    [headers.get("set-cookie")].filter((value): value is string => Boolean(value));
  if (cookieHeaders.length > 0) {
    setResponseHeader("set-cookie", cookieHeaders);
  }
}
