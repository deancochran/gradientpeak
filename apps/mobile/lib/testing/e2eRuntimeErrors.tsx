import * as React from "react";
import { Text, View } from "react-native";
import {
  classifyE2ERuntimeMessage,
  type E2ERuntimeErrorKind,
  parseE2EProcedure,
} from "./e2eRuntimeErrors.shared";

const isE2EEnabled = process.env.EXPO_PUBLIC_MAESTRO_E2E === "1";

type E2ERuntimeErrorEntry = {
  kind: E2ERuntimeErrorKind;
  procedure: string | null;
  source: "console" | "query_cache" | "mutation_cache";
  message: string;
};

type E2ERuntimeErrorState = {
  entries: E2ERuntimeErrorEntry[];
};

const state: E2ERuntimeErrorState = {
  entries: [],
};

const listeners = new Set<() => void>();
let consoleCaptureInstalled = false;

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getMessageFromConsoleArgs(args: unknown[]) {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function recordEntry(entry: E2ERuntimeErrorEntry) {
  const previous = state.entries[state.entries.length - 1];
  if (
    previous &&
    previous.kind === entry.kind &&
    previous.procedure === entry.procedure &&
    previous.message === entry.message
  ) {
    return;
  }

  state.entries = [...state.entries, entry];
  emitChange();
}

function recordMessage(message: string, source: E2ERuntimeErrorEntry["source"]) {
  if (!isE2EEnabled) return;

  const kind = classifyE2ERuntimeMessage(message);
  if (!kind) return;

  recordEntry({
    kind,
    procedure: parseE2EProcedure(message),
    source,
    message,
  });
}

export function installE2ERuntimeErrorCapture() {
  if (!isE2EEnabled || consoleCaptureInstalled) return;

  consoleCaptureInstalled = true;
  const originalConsoleError = console.error;

  console.error = (...args: unknown[]) => {
    recordMessage(getMessageFromConsoleArgs(args), "console");
    originalConsoleError(...args);
  };
}

export function clearE2ERuntimeErrors() {
  if (!isE2EEnabled) return;
  state.entries = [];
  emitChange();
}

export function captureE2EQueryError(
  error: unknown,
  source: Extract<E2ERuntimeErrorEntry["source"], "query_cache" | "mutation_cache">,
) {
  if (!isE2EEnabled) return;

  const message = error instanceof Error ? error.message : String(error);

  if (/TRPCClientError:\s*Aborted/i.test(message)) {
    return;
  }

  recordMessage(message, source);
}

export function useE2ERuntimeErrorState() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function E2ERuntimeErrorStatus() {
  const runtimeState = useE2ERuntimeErrorState();

  if (!isE2EEnabled) {
    return null;
  }

  const latest = runtimeState.entries[runtimeState.entries.length - 1] ?? null;
  const latestSummary = latest ? `${latest.kind}:${latest.procedure ?? "unknown"}` : "none";

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, bottom: 0, opacity: 0.01, maxWidth: 2, maxHeight: 2 }}
    >
      <Text testID="e2e-runtime-error-count">E2E_RUNTIME_ERRORS={runtimeState.entries.length}</Text>
      <Text testID="e2e-runtime-error-latest">E2E_RUNTIME_LATEST={latestSummary}</Text>
    </View>
  );
}
