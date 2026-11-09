import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { calculateCyclingNormalizedPower } from "../calculations/normalized-power";
import { estimateMaxHR } from "../estimators/onboarding";
import {
  ChatbotToolError,
  coreChatbotTools,
  createChatbotToolRegistry,
  defineChatbotTool,
  executeCoreChatbotTool,
  listCoreChatbotTools,
  parseToolOutput,
} from "./index";

describe("Core chatbot tools", () => {
  const timedStep = {
    type: "step" as const,
    id: "11111111-1111-4111-8111-111111111111",
    duration: { type: "time" as const, seconds: 600 },
    targets: [],
  };
  const timedPlan = {
    version: 5 as const,
    activity_category: "run" as const,
    items: [timedStep],
  };
  it("publishes serializable descriptors that match their executable schemas", () => {
    expect(JSON.parse(JSON.stringify(listCoreChatbotTools()))).toEqual(listCoreChatbotTools());
    for (const tool of coreChatbotTools) {
      expect(tool.descriptor.inputSchema).toEqual(
        z.toJSONSchema(tool.inputSchema, { io: "input" }),
      );
      expect(tool.descriptor.outputSchema).toEqual(
        z.toJSONSchema(tool.outputSchema, { io: "output" }),
      );
    }
  });

  it("executes the normalized-power tool with exact Core behavior", async () => {
    const input = {
      samples: [
        { powerWatts: 200, timestampSeconds: 0 },
        { powerWatts: 250, timestampSeconds: 30 },
        { powerWatts: 225, timestampSeconds: 60 },
      ],
    };
    const result = await executeCoreChatbotTool({ input, name: "core.cycling-normalized-power" });
    expect(result).toEqual(calculateCyclingNormalizedPower(input));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("executes the max-heart-rate tool with exact Core behavior", async () => {
    await expect(
      executeCoreChatbotTool({ input: { ageYears: 40 }, name: "core.estimate-max-heart-rate" }),
    ).resolves.toEqual({
      maxHeartRateBpm: estimateMaxHR(40).value,
      method: "age-based-estimate",
    });
  });

  it("validates a malformed plan without returning submitted content", async () => {
    const result = await executeCoreChatbotTool({
      input: {
        structure: {
          ...timedPlan,
          items: [...timedPlan.items, { ...timedStep, targets: [{ type: "rest" }] }],
        },
      },
      name: "core.validate-activity-plan",
    });
    expect(result).toMatchObject({ valid: false });
    expect(result).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "ACTIVITY_PLAN_DUPLICATE_ID", path: ["items", "1", "id"] }),
      ]),
    });
    expect(JSON.stringify(result)).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it.each([
    {},
    { items: null },
    { version: 5, activity_category: "run", items: [{}] },
  ])("returns sanitized validation issues instead of throwing for malformed structure %#", async (structure) => {
    await expect(
      executeCoreChatbotTool({ input: { structure }, name: "core.validate-activity-plan" }),
    ).resolves.toMatchObject({ valid: false, issues: expect.any(Array) });
  });

  it("summarizes a valid plan and exposes explicit-duration availability without medical claims", async () => {
    await expect(
      executeCoreChatbotTool({
        input: { structure: timedPlan },
        name: "core.summarize-activity-plan",
      }),
    ).resolves.toMatchObject({
      activityCategory: "run",
      occurrenceCount: 1,
      exactElapsedSeconds: 600,
      timedActiveSeconds: 600,
    });
    await expect(
      executeCoreChatbotTool({
        input: { structure: timedPlan },
        name: "core.estimate-activity-plan-duration",
      }),
    ).resolves.toEqual({
      basis: "compiled_time",
      confidence: "high",
      status: "exact",
      valueSeconds: 600,
    });
    await expect(
      executeCoreChatbotTool({
        input: {
          structure: {
            version: 5,
            activity_category: "strength",
            items: [
              {
                type: "step",
                id: "22222222-2222-4222-8222-222222222222",
                duration: { type: "repetitions", count: 10 },
                targets: [],
              },
            ],
          },
        },
        name: "core.estimate-activity-plan-duration",
      }),
    ).resolves.toMatchObject({ basis: "repetitions", confidence: "low", status: "estimated" });
  });

  it("rejects malformed input and unknown names without dynamic execution", async () => {
    await expect(
      executeCoreChatbotTool({ input: { ageYears: 0 }, name: "core.estimate-max-heart-rate" }),
    ).rejects.toThrow();
    await expect(executeCoreChatbotTool({ input: {}, name: "core.anything" })).rejects.toThrow(
      "not available",
    );
  });

  it("sanitizes invalid output schema details", () => {
    expect(() => parseToolOutput(z.number(), "raw implementation output")).toThrow(
      "invalid result",
    );
    try {
      parseToolOutput(z.number(), "raw implementation output");
    } catch (error) {
      expect(error).toBeInstanceOf(ChatbotToolError);
      expect(error).toMatchObject({ code: "invalid_tool_output" });
      expect(String(error)).not.toContain("raw implementation output");
    }
  });

  it("derives lookup from definitions regardless of registration order and rejects duplicates", async () => {
    const first = defineChatbotTool({
      description: "Returns the first registered value.",
      execute: (_context, input) => input,
      id: "core.first",
      inputSchema: z.number(),
      operation: "read",
      outputSchema: z.number(),
      retrySafety: "retry_safe",
      scope: "core",
    });
    const second = defineChatbotTool({
      description: "Returns the second registered value.",
      execute: (_context, input) => input,
      id: "core.second",
      inputSchema: z.string(),
      operation: "read",
      outputSchema: z.string(),
      retrySafety: "retry_safe",
      scope: "core",
    });
    const registry = createChatbotToolRegistry([second, first]);

    await expect(registry.execute(undefined, { input: 2, name: "core.first" })).resolves.toBe(2);
    await expect(registry.execute(undefined, { input: "two", name: "core.second" })).resolves.toBe(
      "two",
    );
    expect(() => createChatbotToolRegistry([first, first])).toThrow("Duplicate chatbot tool id");
  });

  it("preserves input/output schema directions, typed parsed input, and rejects unsupported schemas", async () => {
    const inputSchema = z.object({ count: z.coerce.number().int().default(2) });
    const outputSchema = z.object({ count: z.number().default(7) });
    let receivedCount: number | undefined;
    const tool = defineChatbotTool({
      description: "Normalizes a defaulted count and returns a defaulted output.",
      execute: (_context, input) => {
        expectTypeOf(input).toEqualTypeOf<{ count: number }>();
        receivedCount = input.count;
        return {};
      },
      id: "core.defaulted-count",
      inputSchema,
      operation: "read",
      outputSchema,
      retrySafety: "retry_safe",
      scope: "core",
    });

    expect(tool.descriptor.inputSchema).toEqual(z.toJSONSchema(inputSchema, { io: "input" }));
    expect(tool.descriptor.outputSchema).toEqual(z.toJSONSchema(outputSchema, { io: "output" }));
    expect(tool.descriptor.inputSchema).toMatchObject({
      properties: { count: { default: 2, type: "integer" } },
    });
    expect(tool.descriptor.outputSchema).toMatchObject({
      properties: { count: { default: 7, type: "number" } },
      required: ["count"],
    });
    await expect(tool.executeParsed(undefined, {})).resolves.toEqual({ count: 7 });
    expect(receivedCount).toBe(2);

    let receivedTrimmedInput: string | undefined;
    const transformedInputTool = defineChatbotTool({
      description: "Trims a string before the handler receives it.",
      execute: (_context, input) => {
        expectTypeOf(input).toEqualTypeOf<string>();
        receivedTrimmedInput = input;
        return input;
      },
      id: "core.trimmed-input",
      inputSchema: z.string().transform((value) => value.trim()),
      operation: "read",
      outputSchema: z.string(),
      retrySafety: "retry_safe",
      scope: "core",
    });
    expect(transformedInputTool.descriptor.inputSchema).toEqual(
      z.toJSONSchema(transformedInputTool.inputSchema, { io: "input" }),
    );
    await expect(transformedInputTool.executeValidated(undefined, " trimmed ")).resolves.toBe(
      "trimmed",
    );
    expect(receivedTrimmedInput).toBe("trimmed");

    expect(() =>
      defineChatbotTool({
        description: "Cannot represent a date result as JSON Schema.",
        execute: () => new Date(),
        id: "core.date-output",
        inputSchema: z.object({}),
        operation: "read",
        outputSchema: z.date(),
        retrySafety: "retry_safe",
        scope: "core",
      }),
    ).toThrow("cannot be represented as JSON Schema");
  });
});
