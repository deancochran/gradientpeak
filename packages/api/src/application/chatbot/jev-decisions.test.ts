import { describe, expect, it } from "vitest";
import {
  createJevDecisionTools,
  type JevDecisionClient,
  jevDecisionInputSchema,
} from "./jev-decisions";

const input = {
  template: "select_activity_plan" as const,
  context: "easy run tomorrow",
  candidates: [
    { id: "run_easy", evidence: "45 minute easy run" },
    { id: "intervals", evidence: "hard intervals" },
  ],
  questions: [{ id: "fits", question: "Does the selected candidate fit an easy run request?" }],
};
const response = {
  choice: {
    type: "choice",
    choice: "run_easy",
    confidence: 0.9,
    probabilities: { run_easy: 0.9, intervals: 0.05, __none__: 0.05 },
  },
  conditions: { fits: { type: "noul", noul: 0.9 } },
};

async function execute(
  client: JevDecisionClient,
  value = input,
  signal = new AbortController().signal,
) {
  const tool = createJevDecisionTools({ client, signal }).jev_decide;
  if (!tool) throw new Error("decision tool was not created");
  return tool.execute?.(value, { toolCallId: "test", messages: [], abortSignal: signal } as never);
}

describe("Jev decision helper", () => {
  it("maps only a complete supplied-candidate distribution and condition", async () => {
    const result = await execute({ decide: async () => response });
    expect(result).toMatchObject({
      status: "selected",
      candidateId: "run_easy",
      evidenceLimits: "based only on supplied candidates/context",
      conditions: { fits: { status: "assessed", probability: 0.9 } },
    });
  });
  it("fails closed for malformed provider output and never invents a candidate", async () => {
    const result = await execute({
      decide: async () => ({ ...response, choice: { ...response.choice, choice: "invented" } }),
    });
    expect(result).toEqual({
      status: "unavailable",
      evidenceLimits: "based only on supplied candidates/context",
    });
  });
  it.each([
    [
      "missing choice discriminator",
      { ...response, choice: { ...response.choice, type: undefined } },
    ],
    ["wrong choice discriminator", { ...response, choice: { ...response.choice, type: "noul" } }],
    ["missing condition discriminator", { ...response, conditions: { fits: { noul: 0.9 } } }],
    [
      "wrong condition discriminator",
      { ...response, conditions: { fits: { type: "choice", noul: 0.9 } } },
    ],
    ["null choice", { ...response, choice: null }],
    ["array choice", { ...response, choice: [] }],
    ["array probabilities", { ...response, choice: { ...response.choice, probabilities: [] } }],
    ["null conditions", { ...response, conditions: null }],
    ["array condition", { ...response, conditions: { fits: [] } }],
  ])("returns unavailable for %s", async (_caseName, malformed) => {
    const result = await execute({ decide: async () => malformed as never });
    expect(result).toEqual({
      status: "unavailable",
      evidenceLimits: "based only on supplied candidates/context",
    });
  });
  it("rejects duplicate/reserved IDs and oversized aggregate evidence before any call", () => {
    expect(
      jevDecisionInputSchema.safeParse({
        ...input,
        candidates: [{ id: "__none__", evidence: "x" }],
      }).success,
    ).toBe(false);
    expect(
      jevDecisionInputSchema.safeParse({
        ...input,
        candidates: [{ id: "__proto__", evidence: "x" }],
      }).success,
    ).toBe(false);
    expect(
      jevDecisionInputSchema.safeParse({
        ...input,
        questions: [{ id: "constructor", question: "x" }],
      }).success,
    ).toBe(false);
    expect(jevDecisionInputSchema.safeParse({ ...input, context: "x".repeat(2_001) }).success).toBe(
      false,
    );
  });
  it("returns uncertain for abstention or low confidence", async () => {
    const result = await execute({
      decide: async () => ({
        ...response,
        choice: { ...response.choice, choice: "__none__", confidence: 0.3 },
      }),
    });
    expect(result).toMatchObject({ status: "uncertain" });
    expect(result).not.toHaveProperty("candidateId");
  });
  it("propagates cancellation rather than falling back", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      execute({ decide: async () => response }, input, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("maps an SDK/provider deadline AbortError to unavailable when the caller is still active", async () => {
    const result = await execute({
      decide: async () => {
        throw new DOMException("deadline", "AbortError");
      },
    });
    expect(result).toEqual({
      status: "unavailable",
      evidenceLimits: "based only on supplied candidates/context",
    });
  });
  it("propagates an abort that occurs while the provider call is pending", async () => {
    const controller = new AbortController();
    const result = execute(
      {
        decide: async () => {
          controller.abort();
          throw new DOMException("caller cancelled", "AbortError");
        },
      },
      input,
      controller.signal,
    );
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
  it("enforces the three-call turn budget without a fourth provider call", async () => {
    let calls = 0;
    const tools = createJevDecisionTools({
      client: {
        decide: async () => {
          calls += 1;
          return response;
        },
      },
      signal: new AbortController().signal,
    });
    const tool = tools.jev_decide;
    if (!tool) throw new Error("decision tool was not created");
    const execution = {
      toolCallId: "test",
      messages: [],
      abortSignal: new AbortController().signal,
    } as never;
    await tool.execute?.(input, execution);
    await tool.execute?.(input, execution);
    await tool.execute?.(input, execution);
    await expect(tool.execute?.(input, execution)).resolves.toMatchObject({
      status: "unavailable",
    });
    expect(calls).toBe(3);
  });
});
