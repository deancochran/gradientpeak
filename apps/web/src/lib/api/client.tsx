"use client";

import { api, createApiBatchLink, createApiUrl, createQueryClient } from "@repo/api/react";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export { api };

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  } else {
    // Browser: use singleton pattern to keep the same query client
    return (clientQueryClientSingleton ??= createQueryClient());
  }
};

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

function createWebHeaders() {
  const headers = new Headers();
  headers.set("x-api-source", "nextjs");
  headers.set("x-client-type", "web");
  return headers;
}

export function ApiReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [apiClient] = useState(() =>
    api.createClient({
      links: [
        createApiBatchLink({
          url: createApiUrl(getBaseUrl()),
          headers: createWebHeaders,
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={apiClient} queryClient={queryClient}>
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}
