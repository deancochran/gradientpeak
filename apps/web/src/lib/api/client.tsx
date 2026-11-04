import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/client";
import { api, createApiBatchLink, createApiUrl, createQueryClient } from "@repo/api/react";
import type { QueryClient } from "@tanstack/react-query";

import { getAppBaseUrl } from "../app-url";

export { api };

let clientQueryClientSingleton: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    return createQueryClient();
  }

  if (!clientQueryClientSingleton) {
    clientQueryClientSingleton = createQueryClient();
  }

  return clientQueryClientSingleton;
}

export function createWebHeaders() {
  const headers = new Headers();
  headers.set(CONTRACT_EPOCH_HEADER, String(CURRENT_CONTRACT_EPOCH));
  headers.set("x-api-source", "tanstack-start");
  headers.set("x-client-type", "web");
  return headers;
}

type ApiFetch = NonNullable<Parameters<typeof createApiBatchLink>[0]["fetch"]>;

const createApiFetch: ApiFetch = (input, init) => {
  const { body, headers, method, signal } = init ?? {};
  return fetch(input, {
    ...(body === undefined ? {} : { body }),
    ...(headers === undefined ? {} : { headers }),
    ...(method === undefined ? {} : { method }),
    ...(signal === undefined ? {} : { signal }),
    credentials: "include",
  });
};

export function createApiClient() {
  return api.createClient({
    links: [
      createApiBatchLink({
        url: createApiUrl(getAppBaseUrl()),
        fetch: createApiFetch,
        headers: createWebHeaders,
      }),
    ],
  });
}
