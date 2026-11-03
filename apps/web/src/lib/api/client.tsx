import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/client";
import { api, createApiBatchLink, createApiUrl } from "@repo/api/react";

import { getAppBaseUrl } from "../app-url";

export { api };

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
