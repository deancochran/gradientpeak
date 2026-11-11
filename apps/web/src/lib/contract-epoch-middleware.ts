import { CONTRACT_EPOCH_HEADER } from "@repo/api/client";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { CURRENT_CONTRACT_EPOCH_VALUE, hasCurrentContractEpochFormData } from "./contract-epoch";

export const TANSTACK_SERVER_FUNCTION_HEADER = "x-tsr-serverFn";

type ServerFunctionMiddlewareOptions = {
  data?: unknown;
  headers?: HeadersInit;
  request?: Request;
};

// Request identity cannot be manufactured by serialized browser context. Keep
// this proof server-local instead of adding transport metadata to route context.
const documentRequests = new WeakSet<Request>();

export const contractEpochRequestMiddleware = createMiddleware().server(
  async ({ handlerType, request, next }) => {
    if (handlerType === "router" && (request.method === "GET" || request.method === "HEAD")) {
      documentRequests.add(request);
    } else {
      documentRequests.delete(request);
    }
    return next();
  },
);

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
    // Direct SSR is identified by trusted request middleware: current Start
    // executors do not forward client middleware headers into __executeServer.
    const internalRequest = (options as ServerFunctionMiddlewareOptions).request;
    const isDocumentRequest =
      internalRequest !== undefined && documentRequests.has(internalRequest);
    const isTransported = isTransportedServerFunctionRequest(requestHeaders);
    if (
      isTransported
        ? !hasCurrentContractEpoch(requestHeaders)
        : !hasCurrentContractEpoch(requestHeaders) &&
          !isDocumentRequest &&
          !hasCurrentContractEpoch(internalHeaders) &&
          !hasCurrentContractEpochFormData(formData)
    ) {
      throw new Error("Client contract epoch is unsupported");
    }

    return options.next();
  });
