import { describe, expect, it } from "vitest";

import {
  getConversationDisplayName,
  getConversationInitials,
  getConversationPreviewText,
  normalizeConversationSummary,
  normalizeMessageList,
} from "../index";

describe("messaging adapters", () => {
  it("normalizes legacy conversation payloads with message arrays", () => {
    const conversation = normalizeConversationSummary({
      created_at: "2026-03-22T00:00:00.000Z",
      group_name: null,
      id: "11111111-1111-4111-8111-111111111111",
      is_group: false,
      last_message_at: "2026-03-22T01:00:00.000Z",
      messages: [
        {
          content: "See you at 6",
          conversation_id: "11111111-1111-4111-8111-111111111111",
          created_at: "2026-03-22T01:00:00.000Z",
          id: "22222222-2222-4222-8222-222222222222",
          sender_id: "33333333-3333-4333-8333-333333333333",
        },
      ],
      peer_profile: {
        full_name: "Alex Runner",
        username: "alex",
      },
      unread_count: 2,
    });

    expect(conversation).not.toBeNull();
    expect(getConversationDisplayName(conversation!)).toBe("Alex Runner");
    expect(getConversationInitials(conversation!)).toBe("AL");
    expect(getConversationPreviewText(conversation!)).toBe("See you at 6");
  });

  it("drops invalid message records instead of leaking unknown shapes", () => {
    const messages = normalizeMessageList([
      {
        content: "Valid",
        conversation_id: "11111111-1111-4111-8111-111111111111",
        created_at: "2026-03-22T01:00:00.000Z",
        id: "22222222-2222-4222-8222-222222222222",
        sender_id: "33333333-3333-4333-8333-333333333333",
      },
      {
        content: 42,
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("Valid");
  });
});
