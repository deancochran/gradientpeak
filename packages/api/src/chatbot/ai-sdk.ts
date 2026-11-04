import {
  type ChatbotToolDescriptor,
  ChatbotToolError,
  executeCoreChatbotTool,
  listCoreChatbotTools,
} from "@repo/core/chatbot";
import { dynamicTool, jsonSchema, type ToolExecutionOptions, type ToolSet } from "ai";
import type { ApiChatbotToolDescriptor, ChatbotApiExecutor } from "./index";

const providerToolNamePattern = /^[A-Za-z0-9_-]{1,64}$/;

export type ChatbotAiSdkToolMetadata = {
  readonly canonicalId: string;
  readonly description: string;
  readonly name: string;
  readonly operation: "read" | "write";
  readonly scope: "api" | "core";
};

export type ResolveChatbotOperationId = (call: {
  readonly input: unknown;
  readonly toolCallId: string;
  readonly toolId: string;
}) => string | Promise<string>;

export type CreateChatbotAiSdkToolsOptions = {
  /** Existing actor-bound API executor; this adapter never creates request context. */
  readonly apiExecutor: ChatbotApiExecutor;
  /** Required when exposing API writes. Persist the mapping for recovery across process restarts. */
  readonly resolveOperationId?: ResolveChatbotOperationId;
  readonly signal?: AbortSignal;
  /** Test and host composition seam; defaults to the complete Core and API allowlists. */
  readonly descriptors?: readonly (ChatbotToolDescriptor | ApiChatbotToolDescriptor)[];
};

export type ChatbotAiSdkTools = {
  readonly metadata: readonly ChatbotAiSdkToolMetadata[];
  readonly nameToCanonicalId: ReadonlyMap<string, string>;
  readonly tools: ToolSet;
};

/**
 * Adapts the explicit API/Core allowlists to AI SDK dynamic tools. It projects the
 * existing JSON Schemas and delegates back to their validated executors; it does
 * not implement domain behavior, authorization, or idempotency receipts.
 */
export function createChatbotAiSdkTools(
  options: CreateChatbotAiSdkToolsOptions,
): ChatbotAiSdkTools {
  const descriptors = options.descriptors ?? [
    ...options.apiExecutor.listTools(),
    ...listCoreChatbotTools(),
  ];
  const byName = new Map<string, ChatbotToolDescriptor | ApiChatbotToolDescriptor>();
  const metadata: ChatbotAiSdkToolMetadata[] = [];
  const canonicalIds = new Set<string>();
  const hasWrites = descriptors.some((descriptor) => descriptor.operation === "write");
  if (hasWrites && !options.resolveOperationId)
    throw new Error("Chatbot AI SDK writes require resolveOperationId.");

  for (const descriptor of descriptors) {
    if (canonicalIds.has(descriptor.id))
      throw new Error(`Duplicate chatbot tool id: ${descriptor.id}`);
    canonicalIds.add(descriptor.id);
    const name = providerToolName(descriptor.id);
    if (byName.has(name)) throw new Error(`Chatbot provider tool name collision: ${name}`);
    byName.set(name, descriptor);
    metadata.push({
      canonicalId: descriptor.id,
      description: descriptor.description,
      name,
      operation: descriptor.operation,
      scope: descriptor.scope,
    });
  }

  const tools: ToolSet = {};
  for (const [name, descriptor] of byName) {
    const operationIdPath = getOperationIdPath(descriptor);
    const modelInputSchema = operationIdPath
      ? omitJsonSchemaPath(descriptor.inputSchema, operationIdPath)
      : descriptor.inputSchema;
    tools[name] = dynamicTool({
      description: descriptor.description,
      inputSchema: jsonSchema(modelInputSchema),
      execute: async (input: unknown, execution: ToolExecutionOptions<unknown>) => {
        throwIfAborted(options.signal, execution.abortSignal);
        let callInput = input;
        if (operationIdPath) {
          if (hasOwnPath(input, operationIdPath)) {
            throw new ChatbotToolError("invalid_tool_call", "The chatbot tool input is invalid.");
          }
          let operationId: string | undefined;
          try {
            operationId = await options.resolveOperationId?.({
              input,
              toolCallId: execution.toolCallId,
              toolId: descriptor.id,
            });
          } catch {
            throw new ChatbotToolError(
              "internal_error",
              "The chatbot tool could not be completed.",
            );
          }
          throwIfAborted(options.signal, execution.abortSignal);
          if (typeof operationId !== "string" || operationId.length === 0)
            throw new ChatbotToolError("invalid_tool_call", "The chatbot tool input is invalid.");
          callInput = withOwnPath(input, operationIdPath, operationId);
        }
        throwIfAborted(options.signal, execution.abortSignal);
        try {
          return descriptor.scope === "api"
            ? await options.apiExecutor.execute({ input: callInput, name: descriptor.id })
            : await executeCoreChatbotTool({ input: callInput, name: descriptor.id });
        } catch (error) {
          if (error instanceof ChatbotToolError) throw error;
          throw new ChatbotToolError("internal_error", "The chatbot tool could not be completed.");
        }
      },
    });
  }
  return {
    metadata,
    nameToCanonicalId: new Map(metadata.map((item) => [item.name, item.canonicalId])),
    tools,
  };
}

function providerToolName(canonicalId: string): string {
  const name = canonicalId.replaceAll(".", "_");
  if (!providerToolNamePattern.test(name))
    throw new Error(`Invalid chatbot provider tool name for ${canonicalId}`);
  return name;
}

function getOperationIdPath(
  descriptor: ChatbotToolDescriptor | ApiChatbotToolDescriptor,
): readonly string[] | undefined {
  if (descriptor.operation !== "write") return undefined;
  if (!("operationIdPath" in descriptor) || !descriptor.operationIdPath)
    throw new Error(`Chatbot write tool is missing operationIdPath: ${descriptor.id}`);
  return descriptor.operationIdPath;
}

function throwIfAborted(...signals: (AbortSignal | undefined)[]): void {
  if (signals.some((signal) => signal?.aborted)) throw new DOMException("Aborted", "AbortError");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnPath(input: unknown, path: readonly string[]): boolean {
  let value = input;
  for (const key of path) {
    if (!isRecord(value) || !Object.hasOwn(value, key)) return false;
    value = value[key];
  }
  return true;
}

function withOwnPath(input: unknown, path: readonly string[], operationId: string): unknown {
  if (!isRecord(input))
    throw new ChatbotToolError("invalid_tool_call", "The chatbot tool input is invalid.");
  const copy = { ...input };
  let target = copy;
  for (const key of path.slice(0, -1)) {
    const next = target[key];
    if (!isRecord(next))
      throw new ChatbotToolError("invalid_tool_call", "The chatbot tool input is invalid.");
    target[key] = { ...next };
    target = target[key] as Record<string, unknown>;
  }
  const last = path.at(-1);
  if (!last) throw new ChatbotToolError("invalid_tool_call", "The chatbot tool input is invalid.");
  target[last] = operationId;
  return copy;
}

/** Copy-on-write projection: neither the original descriptor nor nested schema nodes are mutated. */
function omitJsonSchemaPath(
  schema: Record<string, unknown>,
  path: readonly string[],
): Record<string, unknown> {
  const projected = omitJsonSchemaPathFromBranch(schema, path);
  if (!projected.found)
    throw new Error(`Chatbot write schema does not contain operationIdPath: ${path.join(".")}`);
  return projected.schema;
}

function omitJsonSchemaPathFromBranch(
  schema: Record<string, unknown>,
  path: readonly string[],
): { found: boolean; schema: Record<string, unknown> } {
  const key = path[0];
  if (!key) throw new Error("Chatbot operationIdPath must not be empty.");
  const rest = path.slice(1);
  const properties = schema.properties;
  if (isRecord(properties) && Object.hasOwn(properties, key)) {
    const nextProperties = { ...properties };
    if (rest.length === 0) delete nextProperties[key];
    else {
      const nested = omitJsonSchemaPathFromBranch(asSchemaObject(properties[key]), rest);
      if (!nested.found) return { found: false, schema };
      nextProperties[key] = nested.schema;
    }
    const required =
      rest.length === 0 && Array.isArray(schema.required)
        ? schema.required.filter((item) => item !== key)
        : schema.required;
    return {
      found: true,
      schema: {
        ...schema,
        properties: nextProperties,
        ...(required === undefined ? {} : { required }),
      },
    };
  }
  for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
    const branches = schema[keyword];
    if (!Array.isArray(branches)) continue;
    const projected = branches.map((branch) =>
      omitJsonSchemaPathFromBranch(asSchemaObject(branch), path),
    );
    if (projected.some((branch) => branch.found)) {
      return {
        found: true,
        schema: { ...schema, [keyword]: projected.map((branch) => branch.schema) },
      };
    }
  }
  return { found: false, schema };
}

function asSchemaObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Chatbot write schema path is not an object schema.");
  return value;
}
