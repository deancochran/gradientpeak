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
import { getAppScheme } from "@/lib/hooks/useAppScheme";
import { getServerConfig, subscribeServerConfig } from "@/lib/server-config";
import { safeSecureStore } from "@/lib/storage/safe-secure-store";

type SessionListener = (session: AuthSession | null) => void;

const listeners = new Set<SessionListener>();

type AuthStorage = Pick<
  typeof safeSecureStore,
  "getItem" | "getItemAsync" | "setItem" | "setItemAsync"
> & {
  retire: () => Promise<void>;
};

type MobileAuthTransport = {
  apiOrigin: string;
  epoch: number;
  storage: AuthStorage;
  storagePrefix: string;
  client: ReturnType<typeof createGradientPeakExpoAuthClient>;
};

let activeTransport!: MobileAuthTransport;

function createAuthStorage(epoch: number): AuthStorage {
  let retired = false;
  let writes = Promise.resolve();
  const queueWrite = (key: string, value: string) => {
    const write = writes.then(async () => {
      if (retired || epoch !== activeTransport.epoch) return;
      await safeSecureStore.setItemAsyncStrict(key, value);
    });
    writes = write.catch(() => undefined);
    return write;
  };

  return {
    getItem: (key) =>
      retired || epoch !== activeTransport.epoch ? null : safeSecureStore.getItem(key),
    getItemAsync: async (key) =>
      retired || epoch !== activeTransport.epoch ? null : safeSecureStore.getItemAsync(key),
    setItem: (key, value) => {
      void queueWrite(key, value);
    },
    setItemAsync: (key, value) => queueWrite(key, value),
    retire: async () => {
      retired = true;
      await writes;
    },
  };
}

function getMobileAuthStoragePrefix(apiUrl = getServerConfig().apiUrl) {
  const origin = new URL(apiUrl).origin.normalize("NFC");
  const bytes = new TextEncoder().encode(origin);
  return `gradientpeak_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function createMobileAuthTransport(epoch: number): MobileAuthTransport {
  const apiUrl = getServerConfig().apiUrl;
  const storagePrefix = getMobileAuthStoragePrefix(apiUrl);
  const storage = createAuthStorage(epoch);
  return {
    apiOrigin: new URL(apiUrl).origin,
    epoch,
    storage,
    storagePrefix,
    client: createGradientPeakExpoAuthClient({
      baseURL: resolveGradientPeakAuthBaseUrl({
        appBaseUrl: apiUrl,
      }),
      scheme: getAppScheme(),
      storagePrefix,
      storage,
    }),
  };
}

activeTransport = createMobileAuthTransport(0);
export let authClient = activeTransport.client;

function getMobileAuthTransport() {
  return activeTransport;
}

function isCurrentMobileAuthTransport(transport: ReturnType<typeof getMobileAuthTransport>) {
  return (
    transport === activeTransport &&
    transport.apiOrigin === new URL(getServerConfig().apiUrl).origin
  );
}

async function purgeMobileAuthStorage(storagePrefix: string) {
  await Promise.all([
    safeSecureStore.setItemAsyncStrict(`${storagePrefix}_cookie`, "{}"),
    safeSecureStore.setItemAsyncStrict(`${storagePrefix}_session_data`, "{}"),
  ]);
}

let unsubscribe: (() => void) | null = null;

subscribeServerConfig(() => {
  const previousTransport = activeTransport;
  activeTransport = createMobileAuthTransport(previousTransport.epoch + 1);
  authClient = activeTransport.client;
  void previousTransport.storage.retire();
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  void emitCurrentSession();
});

function normalizeSession(session: unknown) {
  return normalizeGradientPeakAuthClientSession(session as any, "cookie");
}

async function emitCurrentSession() {
  const transport = getMobileAuthTransport();
  const session = await getMobileAuthSession(transport);
  if (!isCurrentMobileAuthTransport(transport)) return;
  listeners.forEach((listener) => {
    listener(session);
  });
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

export async function getMobileAuthSession(transport = getMobileAuthTransport()) {
  const session = await transport.client.getSession();
  if (!isCurrentMobileAuthTransport(transport)) return null;
  return normalizeSession(session.data);
}

/** Resolves credentials at request time from the current origin-bound Expo client. */
export async function getMobileAuthHeaders(apiUrl: string) {
  const headers = new Headers();
  const transport = getMobileAuthTransport();

  if (new URL(apiUrl).origin !== transport.apiOrigin) return headers;

  const cookie = await transport.client.getCookie();
  if (!isCurrentMobileAuthTransport(transport) || new URL(apiUrl).origin !== transport.apiOrigin) {
    return headers;
  }

  if (cookie) headers.set("Cookie", cookie);
  return headers;
}

export async function refreshMobileAuthSession() {
  const transport = getMobileAuthTransport();
  const session = await getMobileAuthSession(transport);
  if (!isCurrentMobileAuthTransport(transport)) return null;
  listeners.forEach((listener) => {
    listener(session);
  });
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
  const transport = getMobileAuthTransport();
  activeTransport = createMobileAuthTransport(transport.epoch + 1);
  authClient = activeTransport.client;
  try {
    await transport.client.signOut();
  } catch {
    // Remote revocation is best effort; local credential retirement is not.
  }

  try {
    // Better Auth only clears native storage after a successful response. Clear
    // this origin's local credentials even when the remote sign-out fails.
    await transport.storage.retire();
    await purgeMobileAuthStorage(transport.storagePrefix);
    listeners.forEach((listener) => {
      listener(null);
    });
  } catch (error) {
    throw new Error("Local sign-out could not clear secure credentials.", { cause: error });
  }
}
