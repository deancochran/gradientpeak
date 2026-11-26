import type { LanguageModel } from "ai";
import { describe, expect, it } from "vitest";
import {
  type ChatbotModelChooser,
  type ChatbotModelProvider,
  createChatbotModelRouter,
} from "./model-routing";
import { type ChatbotProviderConfig, loadChatbotProviderConfig } from "./provider-config";

const config: ChatbotProviderConfig = {
  fastModelId: "configured-fast-model",
  jevDecisionsEnabled: false,
  jevConfidenceThreshold: 0.75,
  jevMaxRetries: 0,
  jevModelId: "jev-1.14.0",
  jevTimeoutMs: 20,
  maxRequestChars: 12,
  mode: "jev",
  openaiApiKey: "test-openai-key",
  reasoningModelId: "configured-reasoning-model",
  typesafeApiKey: "test-typesafe-key",
};

function provider(): ChatbotModelProvider {
  return { responses: (modelId) => ({ modelId }) as unknown as LanguageModel };
}

function chooser(result: {
  choice: "fast" | "reasoning";
  confidence: number;
}): ChatbotModelChooser {
  return { choose: async () => result };
}

describe("chatbot model routing", () => {
  it("only sends the bounded current request text to the chooser", async () => {
    let received = "";
    const router = createChatbotModelRouter(config, {
      chooser: {
        choose: async ({ text }) => {
          received = text;
          return { choice: "fast", confidence: 0.9 };
        },
      },
      modelProvider: provider(),
    });

    await expect(router.resolve({ text: "123456789012private-history" })).resolves.toMatchObject({
      modelId: config.fastModelId,
      selectedTier: "fast",
    });
    expect(received).toBe("123456789012");
  });

  it("uses only the configured two model IDs and falls back for invalid or uncertain routing", async () => {
    const models: string[] = [];
    const modelProvider: ChatbotModelProvider = {
      responses: (modelId) => {
        models.push(modelId);
        return {} as LanguageModel;
      },
    };
    const invalidRouter = createChatbotModelRouter(config, {
      chooser: { choose: async () => ({ choice: "other", confidence: 1 }) as never },
      modelProvider,
    });
    await expect(invalidRouter.resolve({ text: "hello" })).resolves.toMatchObject({
      modelId: config.reasoningModelId,
      selectionReason: "routing_invalid",
    });

    const uncertainRouter = createChatbotModelRouter(config, {
      chooser: chooser({ choice: "fast", confidence: 0.74 }),
      modelProvider,
    });
    await expect(uncertainRouter.resolve({ text: "hello" })).resolves.toMatchObject({
      modelId: config.reasoningModelId,
      selectionReason: "routing_uncertain",
    });
    expect(models).toEqual([config.reasoningModelId, config.reasoningModelId]);
  });

  it("cancels a slow chooser and falls back to the reasoning tier", async () => {
    let cancelled = false;
    const router = createChatbotModelRouter(config, {
      chooser: {
        choose: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                cancelled = true;
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          }),
      },
      modelProvider: provider(),
    });

    await expect(router.resolve({ text: "slow request" })).resolves.toMatchObject({
      selectedTier: "reasoning",
      selectionReason: "routing_timeout",
    });
    expect(cancelled).toBe(true);
  });

  it("propagates caller cancellation instead of falling back", async () => {
    const controller = new AbortController();
    const router = createChatbotModelRouter(config, {
      chooser: {
        choose: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              {
                once: true,
              },
            );
            controller.abort();
          }),
      },
      modelProvider: provider(),
    });

    await expect(
      router.resolve({ signal: controller.signal, text: "cancel me" }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("defaults to fixed reasoning and does not require a Jev key", async () => {
    const router = createChatbotModelRouter(
      { ...config, mode: "fixed", typesafeApiKey: undefined },
      { modelProvider: provider() },
    );
    await expect(router.resolve({ text: "hello" })).resolves.toMatchObject({
      modelId: config.reasoningModelId,
      selectionReason: "fixed",
    });
  });

  it("fails closed to reasoning when Jev mode has no classifier credential", async () => {
    const router = createChatbotModelRouter(
      { ...config, typesafeApiKey: undefined },
      { modelProvider: provider() },
    );
    await expect(router.resolve({ text: "hello" })).resolves.toMatchObject({
      selectedTier: "reasoning",
      selectionReason: "routing_unavailable",
    });
  });

  it("fails closed without OpenAI credentials when a real model is requested", async () => {
    const router = createChatbotModelRouter(
      { ...config, mode: "fixed", openaiApiKey: undefined },
      {},
    );
    await expect(router.resolve({ text: "hello" })).rejects.toThrow("OPENAI_API_KEY");
  });
});

describe("chatbot provider configuration", () => {
  it("accepts only server-side allowed values and requires explicit model IDs", () => {
    const environment = {
      CHATBOT_JEV_CONFIDENCE_THRESHOLD: "0.8",
      CHATBOT_MODEL_ROUTING_MODE: "jev",
      CHATBOT_OPENAI_FAST_MODEL: "account-configured-fast",
      CHATBOT_OPENAI_REASONING_MODEL: "account-configured-reasoning",
      OPENAI_API_KEY: "openai-key",
      TYPESAFE_API_KEY: "typesafe-key",
      VITE_CHATBOT_OPENAI_FAST_MODEL: "untrusted-client-value",
    };
    expect(loadChatbotProviderConfig(environment)).toMatchObject({
      fastModelId: "account-configured-fast",
      jevConfidenceThreshold: 0.8,
      mode: "jev",
      reasoningModelId: "account-configured-reasoning",
      jevModelId: "jev-1.14.0",
      jevDecisionsEnabled: false,
    });
    expect(() =>
      loadChatbotProviderConfig({ ...environment, CHATBOT_MODEL_ROUTING_MODE: "client" }),
    ).toThrow("CHATBOT_MODEL_ROUTING_MODE");
    expect(() => loadChatbotProviderConfig({ CHATBOT_OPENAI_FAST_MODEL: "fast" })).toThrow(
      "CHATBOT_OPENAI_REASONING_MODEL",
    );
  });
  it("keeps decision helper opt-in and validates its explicit flag", () => {
    const environment = {
      CHATBOT_OPENAI_FAST_MODEL: "fast",
      CHATBOT_OPENAI_REASONING_MODEL: "reasoning",
      CHATBOT_JEV_DECISIONS_ENABLED: "true",
      TYPESAFE_API_KEY: "typesafe-key",
    };
    expect(loadChatbotProviderConfig(environment).jevDecisionsEnabled).toBe(true);
    expect(() =>
      loadChatbotProviderConfig({ ...environment, CHATBOT_JEV_DECISIONS_ENABLED: "jev" }),
    ).toThrow("CHATBOT_JEV_DECISIONS_ENABLED");
    expect(() => {
      const { TYPESAFE_API_KEY: _key, ...withoutKey } = environment;
      return loadChatbotProviderConfig(withoutKey);
    }).toThrow("TYPESAFE_API_KEY");
  });

  it("pins Jev by default and rejects moving aliases", () => {
    const environment = {
      CHATBOT_OPENAI_FAST_MODEL: "fast",
      CHATBOT_OPENAI_REASONING_MODEL: "reasoning",
    };
    expect(loadChatbotProviderConfig(environment).jevModelId).toBe("jev-1.14.0");
    expect(
      loadChatbotProviderConfig({ ...environment, CHATBOT_JEV_MODEL: "jev-1.14.1" }).jevModelId,
    ).toBe("jev-1.14.1");
    expect(() =>
      loadChatbotProviderConfig({ ...environment, CHATBOT_JEV_MODEL: "jev-latest" }),
    ).toThrow("pinned Jev release");
  });
});
