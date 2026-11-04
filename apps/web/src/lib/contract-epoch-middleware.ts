import { CONTRACT_EPOCH_HEADER } from "@repo/api/client";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { CURRENT_CONTRACT_EPOCH_VALUE, hasCurrentContractEpochFormData } from "./contract-epoch";

export const TANSTACK_SERVER_FUNCTION_HEADER = "x-tsr-serverFn";

type ServerFunctionMiddlewareOptions = {
  data?: unknown;
  headers?: HeadersInit;
};

export function hasCurrentContractEpoch(headers: HeadersInit | undefined): boolean {
  return new Headers(headers).get(CONTRACT_EPOCH_HEADER) === CURRENT_CONTRACT_EPOCH_VALUE;
}

export function isTransportedServerFunctionRequest(headers: Headers): boolean {
  return headers.get(TANSTACK_SERVER_FUNCTION_HEADER) === "true";
}

export function getServerActionTrpcSource(headers: Headers): "http" | "server" {
  return isTransportedServerFunctionRequest(headers) ? "http" : "server";
}

export const contractEpochFunctionMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    return next({
      headers: {
        [CONTRACT_EPOCH_HEADER]: CURRENT_CONTRACT_EPOCH_VALUE,
      },
    });
  })
  .server(async (options) => {
    const requestHeaders = getRequestHeaders();
    const internalHeaders = (options as ServerFunctionMiddlewareOptions).headers;
    const formData = (options as ServerFunctionMiddlewareOptions).data;

    // Transported functions must carry the epoch in their actual HTTP request.
    // Direct SSR invocations retain the client middleware headers in-process;
    // these headers are not browser-serializable context or payload data.
    const isTransported = isTransportedServerFunctionRequest(requestHeaders);
    if (
      isTransported
        ? !hasCurrentContractEpoch(requestHeaders)
        : !hasCurrentContractEpoch(requestHeaders) &&
          !hasCurrentContractEpoch(internalHeaders) &&
          !hasCurrentContractEpochFormData(formData)
    ) {
      throw new Error("Client contract epoch is unsupported");
    }

    return options.next();
  });
