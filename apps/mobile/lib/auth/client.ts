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
import type { AuthSession, AuthSessionLike } from "@repo/auth/session";
import { getAppScheme } from "@/lib/hooks/useAppScheme";
import { getServerConfig, subscribeServerConfig } from "@/lib/server-config";
import { safeSecureStore } from "@/lib/storage/safe-secure-store";

type SessionListener = (session: AuthSession | null) => void;

const listeners = new Set<SessionListener>();

function createMobileAuthClient() {
  return createGradientPeakExpoAuthClient({
    baseURL: resolveGradientPeakAuthBaseUrl({
      appBaseUrl: getServerConfig().apiUrl,
    }),
    scheme: getAppScheme(),
    storage: {
      getItem: safeSecureStore.getItem,
      setItem: safeSecureStore.setItem,
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
  emitCurrentSessionDetached();
});

function normalizeSession(session: AuthSessionLike | null | undefined) {
  return normalizeGradientPeakAuthClientSession(session, "bearer");
}

async function emitCurrentSession() {
  const session = await getMobileAuthSession();
  notifySessionListeners(session);
}

function emitCurrentSessionDetached() {
  void emitCurrentSession().catch((error) => {
    console.error("[MobileAuthClient] Failed to emit the current session", error);
  });
}

function notifySessionListeners(session: AuthSession | null) {
  listeners.forEach((listener) => {
    try {
      listener(session);
    } catch (error) {
      console.error("[MobileAuthClient] Session listener failed", error);
    }
  });
}

function subscribeToSessionSignal(client: unknown, listener: () => void): (() => void) | null {
  if (!client || typeof client !== "object") return null;
  const store = Reflect.get(client, "$store");
  if (!store || typeof store !== "object") return null;
  const atoms = Reflect.get(store, "atoms");
  if (!atoms || typeof atoms !== "object") return null;
  const sessionSignal = Reflect.get(atoms, "$sessionSignal");
  if (!sessionSignal || typeof sessionSignal !== "object") return null;
  const listen = Reflect.get(sessionSignal, "listen");
  if (typeof listen !== "function") return null;
  const cleanup = Reflect.apply(listen, sessionSignal, [listener]);
  return typeof cleanup === "function" ? () => void Reflect.apply(cleanup, undefined, []) : null;
}

function ensureSubscription() {
  if (unsubscribe) return;
  unsubscribe = subscribeToSessionSignal(authClient, emitCurrentSessionDetached);
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
  notifySessionListeners(session);
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
