import { api, createApiBatchLink, createApiUrl, createQueryClient } from "@repo/api/react";
import type { QueryClient } from "@tanstack/react-query";

import { getAppBaseUrl } from "../app-url";

export { api };

let clientQueryClientSingleton: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    return createQueryClient();
  }

  return (clientQueryClientSingleton ??= createQueryClient());
}

function createWebHeaders() {
  const headers = new Headers();
  headers.set("x-api-source", "tanstack-start");
  headers.set("x-client-type", "web");
  return headers;
}

function createApiFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    credentials: "include",
  });
}

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
