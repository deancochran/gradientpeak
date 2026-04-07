import type { AuthCallbackIntent } from "@repo/auth/callbacks";
import {
  buildAuthCallbackUrls,
  buildMobileCallbackUrl,
  mobileCallbackPayloadSchema,
} from "@repo/auth/callbacks";
import {
  normalizeGradientPeakAuthClientSession,
  resolveGradientPeakAuthBaseUrl,
} from "@repo/auth/client";
import { createGradientPeakExpoAuthClient } from "@repo/auth/client/expo";
import type { AuthSession } from "@repo/auth/session";
import * as SecureStore from "expo-secure-store";
import { getAppScheme } from "@/lib/hooks/useAppScheme";
import { getServerConfig, subscribeServerConfig } from "@/lib/server-config";

type SessionListener = (session: AuthSession | null) => void;

const listeners = new Set<SessionListener>();

function createMobileAuthClient() {
  return createGradientPeakExpoAuthClient({
    baseURL: resolveGradientPeakAuthBaseUrl({
      appBaseUrl: getServerConfig().apiUrl,
    }),
    scheme: getAppScheme(),
    storage: {
      getItem: SecureStore.getItem,
      setItem: SecureStore.setItem,
    },
  });
}

export let authClient = createMobileAuthClient();

let unsubscribe: (() => void) | null = null;

subscribeServerConfig(() => {
  authClient = createMobileAuthClient();
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  void emitCurrentSession();
});

function normalizeSession(session: unknown) {
  return normalizeGradientPeakAuthClientSession(session as any, "bearer");
}

async function emitCurrentSession() {
  const session = await getMobileAuthSession();
  listeners.forEach((listener) => listener(session));
}

function ensureSubscription() {
  if (unsubscribe) return;

  const sessionAtom = (authClient as any).$store?.atoms?.$sessionSignal;
  if (sessionAtom?.listen) {
    unsubscribe = sessionAtom.listen(() => {
      void emitCurrentSession();
    });
  }
}

function getMobileCallbackUrl(intent: AuthCallbackIntent) {
  return buildAuthCallbackUrls(
    {
      intent,
      target: "mobile",
      fallback: "/auth/login",
    },
    {
      appUrl: getServerConfig().apiUrl,
      loginPath: "/auth/login",
      webCallbackPath: "/auth/confirm",
      mobileScheme: getAppScheme(),
      mobileCallbackPath: "callback",
    },
  ).callbackUrl;
}

export function buildMobileDeepLinkCallback(input: {
  intent: AuthCallbackIntent;
  token?: string;
  code?: string;
  error?: string;
}) {
  return buildMobileCallbackUrl(input, {
    mobileScheme: getAppScheme(),
    mobileCallbackPath: "callback",
  });
}

export function getEmailVerificationCallbackUrl() {
  return getMobileCallbackUrl("email-verification");
}

export function getPasswordResetCallbackUrl() {
  return getMobileCallbackUrl("password-reset");
}

export function getPostSignInCallbackUrl() {
  return getMobileCallbackUrl("post-sign-in");
}

export function parseMobileAuthCallback(input: Record<string, unknown>) {
  return mobileCallbackPayloadSchema.safeParse(input);
}

export async function getMobileAuthSession() {
  const session = await authClient.getSession();
  return normalizeSession(session.data);
}

export async function refreshMobileAuthSession() {
  const session = await getMobileAuthSession();
  listeners.forEach((listener) => listener(session));
  return session;
}

export function subscribeToMobileAuthSession(listener: SessionListener) {
  ensureSubscription();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export async function signOutMobileAuth() {
  const result = await authClient.signOut();
  await emitCurrentSession();
  return result;
}
