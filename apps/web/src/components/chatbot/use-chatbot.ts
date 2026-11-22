import { type ChatbotClientState, createChatbotClient } from "@repo/api/chatbot/client";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { createWebHeaders } from "../../lib/api/client";

const storageKey = (actorId: string) => `gradientpeak:chatbot:${actorId}`;

function snapshotFor(actorId: string) {
  if (typeof window === "undefined") return undefined;
  try {
    return JSON.parse(window.sessionStorage.getItem(storageKey(actorId)) ?? "null");
  } catch {
    return undefined;
  }
}

/** Pending request text is session-only because it may contain private training details. */
function persistenceFor(actorId: string) {
  return {
    save(snapshot: unknown) {
      try {
        window.sessionStorage.setItem(storageKey(actorId), JSON.stringify(snapshot));
      } catch {
        throw new Error("Unable to save chat recovery state");
      }
    },
    clear() {
      try {
        window.sessionStorage.removeItem(storageKey(actorId));
      } catch {
        // A best-effort removal must not prevent local conversation cleanup.
      }
    },
  };
}

export function useChatbot(actorId: string) {
  const client = useMemo(
    () =>
      createChatbotClient({
        endpoint: "/api/chat",
        fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
        createRequestId: () => crypto.randomUUID(),
        headers: createWebHeaders,
        // Render must be identical on the server and initial client hydration.
        // Recovery storage is restored after hydration below.
        ...(typeof window === "undefined" ? {} : { persistence: persistenceFor(actorId) }),
      }),
    [actorId],
  );
  const ownership = useRef({ client, epoch: 0 });
  useEffect(() => {
    const epoch = ++ownership.current.epoch;
    ownership.current.client = client;
    void client.restore(snapshotFor(actorId));
    return () => {
      // React StrictMode probes effects with cleanup/setup in one turn. Defer
      // disposal so that probe does not permanently dispose the live client;
      // actor replacement and real unmount still dispose and abort transport.
      queueMicrotask(() => {
        if (ownership.current.client !== client || ownership.current.epoch === epoch)
          client.dispose();
      });
    };
  }, [actorId, client]);
  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState);
  const send = useCallback(
    async (text: string, onAccepted?: () => void) => {
      await client.send(text, onAccepted);
    },
    [client],
  );
  return { client, state, send } as const;
}

export type ChatbotState = ChatbotClientState;
