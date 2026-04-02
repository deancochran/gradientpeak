import type { AuthCallbackIntent } from "@repo/auth/callbacks";
import { buildAuthCallbackUrls, mobileCallbackPayloadSchema } from "@repo/auth/callbacks";
import {
  normalizeGradientPeakAuthClientSession,
  resolveGradientPeakAuthBaseUrl,
} from "@repo/auth/client";
import { createGradientPeakExpoAuthClient } from "@repo/auth/client/expo";
import type { AuthSession } from "@repo/auth/session";
import * as SecureStore from "expo-secure-store";
import { getAppScheme } from "@/lib/hooks/useAppScheme";
import { getServerConfig } from "@/lib/server-config";

type SessionListener = (session: AuthSession | null) => void;

const listeners = new Set<SessionListener>();

const authClient = createGradientPeakExpoAuthClient({
  baseURL: resolveGradientPeakAuthBaseUrl({
    appBaseUrl: getServerConfig().apiUrl,
  }),
  scheme: getAppScheme(),
  storage: {
    getItemAsync: SecureStore.getItemAsync,
    setItemAsync: SecureStore.setItemAsync,
    deleteItemAsync: SecureStore.deleteItemAsync,
  },
});

export { authClient };

let unsubscribe: (() => void) | null = null;

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

export function getEmailVerificationCallbackUrl() {
  return getMobileCallbackUrl("email-verification");
}

export function getPasswordResetCallbackUrl() {
  return getMobileCallbackUrl("password-reset");
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
