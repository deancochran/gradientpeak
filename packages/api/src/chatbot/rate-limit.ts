import type { ApiContext } from "../context";
import {
  type ApiRateLimitResult,
  type ApiRateLimitStore,
  checkApiRateLimitWithPolicy,
} from "../lib/rate-limit";

export type { ApiRateLimitResult } from "../lib/rate-limit";

export const CHATBOT_RATE_LIMIT_PER_MINUTE = 20;

const chatbotRateLimitPolicy = {
  keyPrefix: "chatbot:user",
  limit: CHATBOT_RATE_LIMIT_PER_MINUTE,
} as const;

/**
 * A dedicated durable bucket for provider-backed chatbot requests. Callers
 * authenticate first, so this policy never admits an anonymous request.
 */
export function checkChatbotRateLimit(
  context: ApiContext,
  now?: number,
  store?: ApiRateLimitStore,
): Promise<ApiRateLimitResult> {
  return checkApiRateLimitWithPolicy(context, chatbotRateLimitPolicy, now, store);
}
