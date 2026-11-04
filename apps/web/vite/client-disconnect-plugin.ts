import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

type Next = (error?: unknown) => void;
type ErrorSource = {
  on(event: "error", listener: (error: unknown) => void): unknown;
  removeListener(event: "error", listener: (error: unknown) => void): unknown;
};

type RequestTransportState = {
  errors: Set<object>;
};

const requestTransportStates = new WeakMap<IncomingMessage, RequestTransportState>();

function isObject(error: unknown): error is object {
  return typeof error === "object" && error !== null;
}

function isConnectionReset(error: unknown): error is object & { code: "ECONNRESET" } {
  return isObject(error) && "code" in error && error.code === "ECONNRESET";
}

function errorSources(request: IncomingMessage, response: ServerResponse): ErrorSource[] {
  return [
    ...new Set([request, response, request.socket, response.socket].filter(isObject)),
  ] as ErrorSource[];
}

export function recordClientDisconnectErrorsMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: Next,
): void {
  const state: RequestTransportState = { errors: new Set() };
  const sources = errorSources(request, response);
  const onError = (error: unknown) => {
    if (isObject(error)) {
      state.errors.add(error);
    }
  };
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    for (const source of sources) {
      source.removeListener("error", onError);
    }
    response.removeListener("finish", cleanup);
    response.removeListener("close", cleanup);
    request.removeListener("close", cleanup);
  };

  requestTransportStates.set(request, state);
  for (const source of sources) {
    source.on("error", onError);
  }
  response.once("finish", cleanup);
  response.once("close", cleanup);
  request.once("close", cleanup);
  next();
}

export function clientDisconnectErrorMiddleware(
  error: unknown,
  request: IncomingMessage,
  _response: ServerResponse,
  next: Next,
): void {
  if (isConnectionReset(error) && requestTransportStates.get(request)?.errors.has(error)) {
    return;
  }

  next(error);
}

export function clientDisconnectRecorderPlugin(): Plugin {
  return {
    name: "gradientpeak-client-disconnect-recorder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(recordClientDisconnectErrorsMiddleware);
    },
  };
}

export function clientDisconnectSuppressionPlugin(): Plugin {
  return {
    name: "gradientpeak-client-disconnect-suppression",
    apply: "serve",
    configureServer(server) {
      return () => {
        server.middlewares.use(clientDisconnectErrorMiddleware);
      };
    },
  };
}
