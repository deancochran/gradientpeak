import { type ChatbotClientState, createChatbotClient } from "@repo/api/chatbot/client";
import * as Crypto from "expo-crypto";
import { AppState } from "react-native";
import { createMobileHeaders } from "@/lib/api";
import { getServerConfig } from "@/lib/server-config";
import { safeSecureStore } from "@/lib/storage/safe-secure-store";
import { useAuthStore } from "@/lib/stores/auth-store";

const STORAGE_PREFIX = "chatbot.pending.";
const CHUNK_MARKER = "\u0001chatbot-chunks:v1:";
// Expo SecureStore's native value limit varies by platform. Keep each value
// comfortably below the smallest documented limit and bound cleanup because
// SecureStore cannot enumerate keys.
const CHUNK_BYTES = 1_800;
const MAX_CHUNKS = 16;

type Client = ReturnType<typeof createChatbotClient>;
type Controller = Client & { readonly actorId: string; disposeForLogout(): Promise<void> };

const controllers = new Map<string, Controller>();
const loadingControllers = new Map<string, Promise<Controller>>();
const drafts = new Map<string, string>();
const actorEpochs = new Map<string, number>();
const persistenceQueues = new Map<string, Promise<void>>();

// Controllers are actor-scoped. Clearing the old actor on an auth transition
// prevents a signed-out or switched account from ever restoring private text.
let previousActorId = useAuthStore.getState().user?.id ?? null;
useAuthStore.subscribe((state) => {
  const nextActorId = state.user?.id ?? null;
  if (previousActorId && previousActorId !== nextActorId)
    void disposeChatbotControllerForActor(previousActorId);
  previousActorId = nextActorId;
});

function storageKey(actorId: string) {
  return `${STORAGE_PREFIX}${actorId}`;
}

function parseManifest(value: string | null): { slot: "a" | "b"; count: number } | null {
  if (!value?.startsWith(CHUNK_MARKER)) return null;
  const match = /^(a|b):(\d+)$/.exec(value.slice(CHUNK_MARKER.length));
  if (!match) throw new Error("Invalid chatbot snapshot manifest");
  const count = Number(match[2]);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_CHUNKS)
    throw new Error("Invalid chatbot snapshot manifest");
  return { slot: match[1] as "a" | "b", count };
}

function splitForSecureStore(value: string): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = "";
  let size = 0;
  for (const codePoint of value) {
    const codePointBytes = encoder.encode(codePoint).byteLength;
    if (size + codePointBytes > CHUNK_BYTES && chunk) {
      chunks.push(chunk);
      chunk = "";
      size = 0;
    }
    chunk += codePoint;
    size += codePointBytes;
  }
  if (chunk) chunks.push(chunk);
  if (chunks.length > MAX_CHUNKS)
    throw new Error("Chatbot snapshot exceeds secure recovery capacity");
  return chunks;
}

async function clearSlot(key: string, slot: "a" | "b") {
  for (let index = 0; index < MAX_CHUNKS; index += 1)
    await safeSecureStore.deleteItemAsyncOrThrow(`${key}.${slot}.${index}`);
}

function queuePersistenceWork<T>(actorId: string, work: () => Promise<T>): Promise<T> {
  const prior = persistenceQueues.get(actorId) ?? Promise.resolve();
  const result = prior.then(work, work);
  // Keep later work moving after a failed save while preserving the failure for
  // the caller that initiated it.
  persistenceQueues.set(
    actorId,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

export function createChatbotPersistence(actorId: string) {
  const key = storageKey(actorId);
  const epoch = actorEpochs.get(actorId) ?? 0;
  return {
    async load() {
      return queuePersistenceWork(actorId, async () => {
        const raw = await safeSecureStore.getItemAsyncOrThrow(key);
        if (!raw) return {};
        try {
          const manifest = parseManifest(raw);
          if (manifest) {
            const parts = await Promise.all(
              Array.from({ length: manifest.count }, (_, index) =>
                safeSecureStore.getItemAsyncOrThrow(`${key}.${manifest.slot}.${index}`),
              ),
            );
            if (parts.some((part) => part === null)) throw new Error("Incomplete chatbot snapshot");
            return JSON.parse(parts.join("")) as unknown;
          }
          // Read the pre-chunking shape during an app upgrade.
          return JSON.parse(raw) as unknown;
        } catch {
          await Promise.all([clearSlot(key, "a"), clearSlot(key, "b")]);
          await safeSecureStore.deleteItemAsyncOrThrow(key);
          return {};
        }
      });
    },
    async save(snapshot: unknown) {
      return queuePersistenceWork(actorId, async () => {
        const encoded = JSON.stringify(snapshot);
        const chunks = splitForSecureStore(encoded);
        const current = parseManifest(await safeSecureStore.getItemAsyncOrThrow(key));
        const slot = current?.slot === "a" ? "b" : "a";
        await clearSlot(key, slot);
        for (const [index, chunk] of chunks.entries())
          await safeSecureStore.setItemAsyncOrThrow(`${key}.${slot}.${index}`, chunk);
        // The manifest is the commit point: an interrupted write leaves the
        // previous slot readable and never exposes a partial new snapshot.
        // A logout invalidates this persistence instance before its queued
        // cleanup starts, so no stale save may publish after logout began.
        if ((actorEpochs.get(actorId) ?? 0) !== epoch)
          throw new Error("Chatbot persistence was invalidated");
        await safeSecureStore.setItemAsyncOrThrow(key, `${CHUNK_MARKER}${slot}:${chunks.length}`);
        if (current) {
          // The manifest already made the new snapshot durable. Retiring the
          // old slot only reclaims space and must not report the save as failed.
          try {
            await clearSlot(key, current.slot);
          } catch {}
        }
      });
    },
    async clear() {
      return queuePersistenceWork(actorId, async () => {
        await Promise.all([clearSlot(key, "a"), clearSlot(key, "b")]);
        await safeSecureStore.deleteItemAsyncOrThrow(key);
      });
    },
  };
}

async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const authHeaders = await createMobileHeaders();
  authHeaders.forEach((value, name) => {
    headers.set(name, value);
  });
  return fetch(input, { ...init, headers, credentials: "omit" });
}

export async function getChatbotController(actorId: string): Promise<Controller> {
  const existing = controllers.get(actorId);
  if (existing) return existing;
  const loading = loadingControllers.get(actorId);
  if (loading) return loading;
  const epoch = actorEpochs.get(actorId) ?? 0;
  const create = async (): Promise<Controller> => {
    const snapshotStorage = createChatbotPersistence(actorId);
    const client = createChatbotClient({
      endpoint: `${getServerConfig().apiUrl.replace(/\/$/, "")}/api/chat`,
      fetch: authenticatedFetch,
      headers: {},
      createRequestId: () => Crypto.randomUUID(),
      initialSnapshot: await snapshotStorage.load(),
      persistence: snapshotStorage,
    });
    if ((actorEpochs.get(actorId) ?? 0) !== epoch) {
      client.dispose();
      await snapshotStorage.clear();
      return Object.assign(client, { actorId, disposeForLogout: async () => {} });
    }
    const controller: Controller = Object.assign(client, {
      actorId,
      async disposeForLogout() {
        client.dispose();
        controllers.delete(actorId);
        drafts.delete(actorId);
        await snapshotStorage.clear();
      },
    });
    controllers.set(actorId, controller);
    return controller;
  };
  let pending: Promise<Controller>;
  pending = create().finally(() => {
    if (loadingControllers.get(actorId) === pending) loadingControllers.delete(actorId);
  });
  loadingControllers.set(actorId, pending);
  return pending;
}

export async function disposeChatbotControllerForActor(actorId: string | null | undefined) {
  if (!actorId) return;
  actorEpochs.set(actorId, (actorEpochs.get(actorId) ?? 0) + 1);
  loadingControllers.delete(actorId);
  const controller = controllers.get(actorId);
  if (controller) await controller.disposeForLogout();
  else {
    drafts.delete(actorId);
    await createChatbotPersistence(actorId).clear();
  }
}

export function getChatbotDraft(actorId: string) {
  return drafts.get(actorId) ?? "";
}

export function setChatbotDraft(actorId: string, draft: string) {
  drafts.set(actorId, draft);
}

export function subscribeToForeground(
  controller: Pick<Client, "refresh" | "stop">,
  lifecycle: Pick<typeof AppState, "addEventListener"> = AppState,
) {
  void controller.refresh();
  const subscription = lifecycle.addEventListener("change", (nextState) => {
    if (nextState === "active") void controller.refresh();
    else if (nextState === "background" || nextState === "inactive") controller.stop();
  });
  return () => subscription.remove();
}

export function isAccepted(state: ChatbotClientState) {
  return state.status === "streaming" || state.status === "completed";
}
