import superjson from "superjson";

export const scenarioApplyReceiptCommand = "chatbot.planned-sessions.apply-scenario";

type ScenarioReceipt = { command: string; result: unknown };

function decodeReceiptResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const envelope = result as Record<string, unknown>;
  if (!("version" in envelope) && !("value" in envelope)) return result;
  if (envelope.version !== 1 || !envelope.value || typeof envelope.value !== "object") return null;
  const value = envelope.value as Record<string, unknown>;
  if (!("json" in value)) return null;
  try {
    return superjson.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

export function receiptResultReferencesSession(receipt: ScenarioReceipt, sessionId: string) {
  if (receipt.command !== scenarioApplyReceiptCommand) return false;
  const result = decodeReceiptResult(receipt.result);
  if (!result || typeof result !== "object") return false;
  const session = (result as Record<string, unknown>).session;
  if (!session || typeof session !== "object") return false;
  return (session as Record<string, unknown>).id === sessionId;
}
