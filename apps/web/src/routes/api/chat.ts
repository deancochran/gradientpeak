import { createChatbotHost } from "@repo/api/chatbot/host";
import { checkChatbotRateLimit } from "@repo/api/chatbot/rate-limit";
import { createChatbotRecoveryService } from "@repo/api/chatbot/recovery";
import { createApiContext } from "@repo/api/server";
import { resolveAuthSession } from "@repo/auth/server";
import { db } from "@repo/db/client";
import { createFileRoute } from "@tanstack/react-router";

import { createChatbotHttpHandler } from "../../lib/chatbot-http";

const host = createChatbotHost();
const recovery = createChatbotRecoveryService();

export const handleChatbotRequest = createChatbotHttpHandler({
  createContext: (request) =>
    createApiContext({
      headers: new Headers(request.headers),
      trpcSource: "http",
      auth: { resolveSession: resolveAuthSession },
      db,
    }),
  checkRateLimit: checkChatbotRateLimit,
  host,
  recovery,
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      GET: ({ request }) => handleChatbotRequest(request),
      POST: ({ request }) => handleChatbotRequest(request),
    },
  },
});
