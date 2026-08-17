import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/client";
import { describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => request.headers,
}));

import {
  contractEpochFunctionMiddleware,
  getServerActionTrpcSource,
} from "./contract-epoch-middleware";

function requireMiddleware<T>(middleware: T | undefined): T {
  if (!middleware) throw new Error("Contract epoch middleware is not configured");
  return middleware;
}

const clientMiddleware = requireMiddleware(contractEpochFunctionMiddleware.options.client);
const serverMiddleware = requireMiddleware(contractEpochFunctionMiddleware.options.server);
const FUTURE_CONTRACT_EPOCH = String(CURRENT_CONTRACT_EPOCH + 1);

describe("contract epoch server-function middleware", () => {
  it("emits the exact current epoch header", async () => {
    const next = vi.fn(async (options) => options);

    await clientMiddleware({ next } as never);

    expect(next).toHaveBeenCalledWith({
      headers: { [CONTRACT_EPOCH_HEADER]: String(CURRENT_CONTRACT_EPOCH) },
    });
  });

  it("keeps an initial SSR document request valid through its loader caller", async () => {
    request.headers = new Headers();
    const next = vi.fn(async () => ({ accepted: true }));

    await expect(
      serverMiddleware({
        headers: new Headers({ [CONTRACT_EPOCH_HEADER]: String(CURRENT_CONTRACT_EPOCH) }),
        next,
      } as never),
    ).resolves.toEqual({ accepted: true });

    expect(next).toHaveBeenCalledOnce();
    expect(getServerActionTrpcSource(request.headers)).toBe("server");
  });

  it("accepts a current native form submission without weakening transported requests", async () => {
    request.headers = new Headers();
    const data = new FormData();
    data.set(CONTRACT_EPOCH_HEADER, String(CURRENT_CONTRACT_EPOCH));
    const next = vi.fn(async () => ({ accepted: true }));

    await expect(serverMiddleware({ data, next } as never)).resolves.toEqual({ accepted: true });
    expect(next).toHaveBeenCalledOnce();

    request.headers = new Headers({ "x-tsr-serverFn": "true" });
    await expect(serverMiddleware({ data, next: vi.fn() } as never)).rejects.toThrow(
      "Client contract epoch is unsupported",
    );
  });

  it.each([
    undefined,
    "",
    "1.0",
    FUTURE_CONTRACT_EPOCH,
  ])("rejects a native form with a missing or mismatched epoch", async (epoch) => {
    request.headers = new Headers();
    const data = new FormData();
    if (epoch !== undefined) data.set(CONTRACT_EPOCH_HEADER, epoch);
    const next = vi.fn();

    await expect(serverMiddleware({ data, next } as never)).rejects.toThrow(
      "Client contract epoch is unsupported",
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a current transported server function and marks its caller external", async () => {
    request.headers = new Headers({
      [CONTRACT_EPOCH_HEADER]: String(CURRENT_CONTRACT_EPOCH),
      "x-tsr-serverFn": "true",
    });
    const next = vi.fn(async () => ({ accepted: true }));

    await expect(serverMiddleware({ next } as never)).resolves.toEqual({ accepted: true });

    expect(next).toHaveBeenCalledOnce();
    expect(getServerActionTrpcSource(request.headers)).toBe("http");
  });

  it.each([
    undefined,
    "",
    "01",
    "1.0",
    FUTURE_CONTRACT_EPOCH,
  ])("rejects a missing or mismatched transported mutation before its handler runs", async (epoch) => {
    request.headers = new Headers({
      "x-tsr-serverFn": "true",
      ...(epoch === undefined ? {} : { [CONTRACT_EPOCH_HEADER]: epoch }),
    });
    const next = vi.fn();

    await expect(
      serverMiddleware({
        // A transported request must not be rescued by any internal value.
        headers: new Headers({ [CONTRACT_EPOCH_HEADER]: String(CURRENT_CONTRACT_EPOCH) }),
        next,
      } as never),
    ).rejects.toThrow("Client contract epoch is unsupported");

    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a request that omits the server-function marker and both epoch sources", async () => {
    request.headers = new Headers();
    const next = vi.fn();

    await expect(serverMiddleware({ next } as never)).rejects.toThrow(
      "Client contract epoch is unsupported",
    );

    expect(next).not.toHaveBeenCalled();
  });

  it("does not accept a browser-supplied context value in place of the request header", async () => {
    request.headers = new Headers({ "x-tsr-serverFn": "true" });
    const next = vi.fn();

    await expect(
      serverMiddleware({
        context: { [CONTRACT_EPOCH_HEADER]: String(CURRENT_CONTRACT_EPOCH) },
        next,
      } as never),
    ).rejects.toThrow("Client contract epoch is unsupported");

    expect(next).not.toHaveBeenCalled();
  });
});
