const routingModes = ["fixed", "jev"] as const;

export type ChatbotModelRoutingMode = (typeof routingModes)[number];

export type ChatbotProviderConfig = {
  readonly jevDecisionsEnabled: boolean;
  readonly fastModelId: string;
  readonly jevConfidenceThreshold: number;
  readonly jevMaxRetries: number;
  /** An immutable Jev release, never the drifting `jev-latest` alias. */
  readonly jevModelId: string;
  readonly jevTimeoutMs: number;
  readonly maxRequestChars: number;
  readonly mode: ChatbotModelRoutingMode;
  readonly openaiApiKey?: string | undefined;
  readonly reasoningModelId: string;
  readonly typesafeApiKey?: string | undefined;
};

export type ChatbotProviderEnvironment = Readonly<Record<string, string | undefined>>;

const defaultConfig = {
  jevConfidenceThreshold: 0.75,
  jevMaxRetries: 0,
  jevModelId: "jev-1.14.0",
  jevTimeoutMs: 2_000,
  maxRequestChars: 4_000,
  mode: "fixed" as const,
};

/**
 * Parses server-only chatbot provider configuration. Model IDs are intentionally
 * required: deployment configuration, not a user request, chooses the allowlist.
 */
export function loadChatbotProviderConfig(
  environment: ChatbotProviderEnvironment = process.env,
): ChatbotProviderConfig {
  const mode = readEnum(
    environment,
    "CHATBOT_MODEL_ROUTING_MODE",
    routingModes,
    defaultConfig.mode,
  );
  const config: ChatbotProviderConfig = {
    fastModelId: readRequired(environment, "CHATBOT_OPENAI_FAST_MODEL"),
    jevDecisionsEnabled: readBoolean(environment, "CHATBOT_JEV_DECISIONS_ENABLED", false),
    jevConfidenceThreshold: readNumber(
      environment,
      "CHATBOT_JEV_CONFIDENCE_THRESHOLD",
      defaultConfig.jevConfidenceThreshold,
      0,
      1,
    ),
    jevMaxRetries: readInteger(
      environment,
      "CHATBOT_JEV_MAX_RETRIES",
      defaultConfig.jevMaxRetries,
      0,
      2,
    ),
    jevModelId: readPinnedJevModel(environment),
    jevTimeoutMs: readInteger(
      environment,
      "CHATBOT_JEV_TIMEOUT_MS",
      defaultConfig.jevTimeoutMs,
      100,
      10_000,
    ),
    maxRequestChars: readInteger(
      environment,
      "CHATBOT_ROUTER_MAX_INPUT_CHARS",
      defaultConfig.maxRequestChars,
      1,
      12_000,
    ),
    mode,
    openaiApiKey: readOptional(environment, "OPENAI_API_KEY"),
    reasoningModelId: readRequired(environment, "CHATBOT_OPENAI_REASONING_MODEL"),
    typesafeApiKey: readOptional(environment, "TYPESAFE_API_KEY"),
  };
  if ((config.mode === "jev" || config.jevDecisionsEnabled) && !config.typesafeApiKey)
    throw new Error(
      "TYPESAFE_API_KEY must be configured when Jev routing or decisions are enabled.",
    );
  return config;
}

function readBoolean(
  environment: ChatbotProviderEnvironment,
  name: string,
  fallback: boolean,
): boolean {
  const value = readOptional(environment, name);
  if (value === undefined) return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`${name} must be true or false.`);
}

function readPinnedJevModel(environment: ChatbotProviderEnvironment): string {
  const value = readOptional(environment, "CHATBOT_JEV_MODEL") ?? defaultConfig.jevModelId;
  // A selector alias can change confidence distributions without a deploy.
  if (!/^jev-\d+\.\d+\.\d+$/.test(value))
    throw new Error("CHATBOT_JEV_MODEL must be a pinned Jev release such as jev-1.14.0.");
  return value;
}

function readRequired(environment: ChatbotProviderEnvironment, name: string): string {
  const value = readOptional(environment, name);
  if (!value) throw new Error(`${name} must be configured for the chatbot.`);
  return value;
}

function readOptional(environment: ChatbotProviderEnvironment, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}

function readEnum<T extends readonly string[]>(
  environment: ChatbotProviderEnvironment,
  name: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  const value = readOptional(environment, name) ?? fallback;
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(", ")}.`);
  return value;
}

function readInteger(
  environment: ChatbotProviderEnvironment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = readNumber(environment, name, fallback, minimum, maximum);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}

function readNumber(
  environment: ChatbotProviderEnvironment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = readOptional(environment, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  return value;
}
