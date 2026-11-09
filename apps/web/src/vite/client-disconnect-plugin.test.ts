import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { Plugin } from "vite";
import { describe, expect, it, vi } from "vitest";

import {
  clientDisconnectErrorMiddleware,
  clientDisconnectRecorderPlugin,
  clientDisconnectSuppressionPlugin,
  recordClientDisconnectErrorsMiddleware,
} from "../../vite/client-disconnect-plugin";

function request(socket = new EventEmitter()): IncomingMessage & EventEmitter {
  const request = new EventEmitter();
  Object.assign(request, { aborted: false, socket });
  return request as IncomingMessage & EventEmitter;
}

function response(socket = new EventEmitter()): ServerResponse & EventEmitter {
  const response = new EventEmitter();
  Object.assign(response, { destroyed: false, socket });
  return response as ServerResponse & EventEmitter;
}

function record(request: IncomingMessage, response: ServerResponse): void {
  recordClientDisconnectErrorsMiddleware(request, response, vi.fn());
}

function configure(plugin: Plugin, server: never): unknown {
  const hook = plugin.configureServer;
  if (!hook) {
    return undefined;
  }
  const handler = typeof hook === "function" ? hook : hook.handler;
  return (handler as unknown as (server: never) => unknown)(server);
}

describe("client disconnect Vite middleware", () => {
  it("registers the recorder immediately during server configuration", () => {
    const use = vi.fn();
    const server = { middlewares: { use } };
    const plugin = clientDisconnectRecorderPlugin();

    configure(plugin, server as never);

    expect(plugin.apply).toBe("serve");
    expect(use).toHaveBeenCalledOnce();
    expect(use).toHaveBeenCalledWith(recordClientDisconnectErrorsMiddleware);
  });

  it("registers suppression in the configureServer post-hook", () => {
    const use = vi.fn();
    const server = { middlewares: { use } };
    const plugin = clientDisconnectSuppressionPlugin();

    const postHook = configure(plugin, server as never);

    expect(plugin.apply).toBe("serve");
    expect(use).not.toHaveBeenCalled();
    expect(postHook).toBeTypeOf("function");
    (postHook as () => void)();
    expect(use).toHaveBeenCalledWith(clientDisconnectErrorMiddleware);
  });

  it("suppresses the exact ECONNRESET emitted by the request transport", () => {
    const requestSocket = new EventEmitter();
    const requestObject = request(requestSocket);
    const responseObject = response(requestSocket);
    const next = vi.fn();
    const transportError = Object.assign(new Error("client disconnected"), {
      code: "ECONNRESET",
    });

    record(requestObject, responseObject);
    requestSocket.emit("error", transportError);
    clientDisconnectErrorMiddleware(transportError, requestObject, responseObject, next);

    expect(next).not.toHaveBeenCalled();
  });

  it("propagates a distinct backend ECONNRESET after a client socket error", () => {
    const requestSocket = new EventEmitter();
    const requestObject = request(requestSocket);
    const responseObject = response(requestSocket);
    const next = vi.fn();
    const clientError = Object.assign(new Error("client disconnected"), {
      code: "ECONNRESET",
    });
    const backendError = Object.assign(new Error("database reset"), {
      code: "ECONNRESET",
    });

    record(requestObject, responseObject);
    requestSocket.emit("error", clientError);
    clientDisconnectErrorMiddleware(backendError, requestObject, responseObject, next);

    expect(next).toHaveBeenCalledWith(backendError);
  });

  it("propagates non-reset errors, including recorded transport errors", () => {
    const requestObject = request();
    const responseObject = response();
    const next = vi.fn();
    const error = new Error("broken pipe");
    Object.assign(error, { code: "EPIPE" });

    record(requestObject, responseObject);
    requestObject.emit("error", error);
    clientDisconnectErrorMiddleware(error, requestObject, responseObject, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("cleans up error listeners when the response finishes", () => {
    const requestSocket = new EventEmitter();
    const requestObject = request(requestSocket);
    const responseObject = response(requestSocket);

    record(requestObject, responseObject);
    expect(requestObject.listenerCount("error")).toBe(1);
    expect(responseObject.listenerCount("error")).toBe(1);
    expect(requestSocket.listenerCount("error")).toBe(1);

    responseObject.emit("finish");

    expect(requestObject.listenerCount("error")).toBe(0);
    expect(responseObject.listenerCount("error")).toBe(0);
    expect(requestSocket.listenerCount("error")).toBe(0);
  });
});
