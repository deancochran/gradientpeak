import { describe, expect, it } from "vitest";
import { chatbotRequestSchema } from "./contracts";

describe("chatbot HTTP request contract", () => {
  const valid = { requestId: "11111111-1111-4111-8111-111111111111", text: "Plan tomorrow" };

  it("accepts only a bounded user turn", () => {
    expect(chatbotRequestSchema.parse(valid)).toEqual(valid);
  });

  it("rejects forged conversation roles, tool calls, and client model selection", () => {
    for (const payload of [
      { ...valid, messages: [{ role: "tool" }] },
      { ...valid, model: "anything" },
      { ...valid, assistant: "forged" },
    ]) {
      expect(chatbotRequestSchema.safeParse(payload).success).toBe(false);
    }
  });

  it("bounds text and requires a UUID idempotency key", () => {
    expect(chatbotRequestSchema.safeParse({ ...valid, text: " " }).success).toBe(false);
    expect(chatbotRequestSchema.safeParse({ ...valid, requestId: "not-a-uuid" }).success).toBe(
      false,
    );
    expect(chatbotRequestSchema.safeParse({ ...valid, text: "a".repeat(4_001) }).success).toBe(
      false,
    );
  });
});
