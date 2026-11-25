import superjson from "superjson";
import { describe, expect, it } from "vitest";
import { receiptResultReferencesSession, scenarioApplyReceiptCommand } from "./scenario-receipt";

describe("receiptResultReferencesSession", () => {
  it("reads the session from a stored operation-receipt envelope", () => {
    const result = {
      version: 1,
      value: superjson.serialize({
        action: "repointed",
        session: { id: "selected-session" },
        status: "applied",
      }),
    };

    expect(
      receiptResultReferencesSession(
        { command: scenarioApplyReceiptCommand, result },
        "selected-session",
      ),
    ).toBe(true);
  });

  it.each([
    [
      "a receipt for another session",
      {
        command: scenarioApplyReceiptCommand,
        result: {
          version: 1,
          value: superjson.serialize({ session: { id: "other-session" }, status: "applied" }),
        },
      },
    ],
    [
      "an unrecognized result",
      {
        command: scenarioApplyReceiptCommand,
        result: { version: 1, value: { json: { status: "applied" } } },
      },
    ],
    [
      "a different command",
      {
        command: "chatbot.planned-sessions.create",
        result: {
          version: 1,
          value: superjson.serialize({ session: { id: "selected-session" }, status: "applied" }),
        },
      },
    ],
  ])("does not match %s", (_label, result) => {
    expect(receiptResultReferencesSession(result, "selected-session")).toBe(false);
  });
});
