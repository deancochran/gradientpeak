import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { buildFlashHref } from "../flash";
import { createServerActionCaller } from "../server-action-api";

const sendMessageActionSchema = z.object({
  content: z.string().trim().min(1, "Message is required"),
  conversation_id: z.string().uuid(),
  redirectTo: z.string().optional(),
});

function normalizeMessageInput(data: unknown) {
  const native = data instanceof FormData;

  if (data instanceof FormData) {
    return {
      ...sendMessageActionSchema.parse(Object.fromEntries(data.entries())),
      _native: native,
    };
  }

  return {
    ...sendMessageActionSchema.parse(data),
    _native: native,
  };
}

export const sendMessageAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeMessageInput(data))
  .handler(async ({ data }) => {
    try {
      const caller = await createServerActionCaller();
      await caller.messaging.sendMessage({
        content: data.content,
        conversation_id: data.conversation_id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message";
      const redirectTarget = data.redirectTo || `/messages?conversationId=${data.conversation_id}`;

      if (data._native) {
        throw redirect({ href: buildFlashHref(redirectTarget, message, "error"), statusCode: 303 });
      }

      throw error;
    }

    const redirectTarget = data.redirectTo || `/messages?conversationId=${data.conversation_id}`;
    throw redirect({ href: redirectTarget, statusCode: 303 });
  });
