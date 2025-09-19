import { QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";

import { createQueryClient } from "@repo/trpc/client";
import { createTRPCClient } from "@trpc/client";
import {
  setupFocusManager,
  setupNetworkListener,
} from "../services/react-query-setup";
import { trpc } from "../trpc";
const queryClient = createQueryClient();

// Initialize once

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // const [trpcClient] = React.useState(() =>
  //   trpc.createClient({
  //     links: [
  //       // Add logger in development
  //       loggerLink({
  //         enabled: (opts) =>
  //           __DEV__ ||
  //           (opts.direction === "down" && opts.result instanceof Error),
  //       }),
  //       httpBatchLink({
  //         transformer: superjson,
  //         url: process.env.EXPO_PUBLIC_API_URL
  //           ? `${process.env.EXPO_PUBLIC_API_URL}/api/trpc`
  //           : "http://localhost:3000/api/trpc",
  //         headers: getAuthHeaders,
  //       }),
  //     ],
  //   }),
  // );
  const [trpcClient] = React.useState(createTRPCClient);

  React.useEffect(() => {
    const cleanupNetwork = setupNetworkListener();
    const cleanupFocus = setupFocusManager();

    return () => {
      cleanupNetwork?.();
      cleanupFocus?.();
    };
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

// import { QueryClientProvider } from "@tanstack/react-query";
// import * as React from "react";
// import { queryClient } from "../services/queryClient";
// import { createTRPCClient } from "../services/trpcClient";
// import { setupFocusManager, setupNetworkListener } from "../services/reactQuerySetup";
// import { trpc } from "../trpc";

// export function QueryProvider({ children }: { children: React.ReactNode }) {
//   const [trpcClient] = React.useState(createTRPCClient);

//   React.useEffect(() => {
//     const cleanupNetwork = setupNetworkListener();
//     const cleanupFocus = setupFocusManager();

//     return () => {
//       cleanupNetwork?.();
//       cleanupFocus?.();
//     };
//   }, []);

//   return (
//     <trpc.Provider client={trpcClient} queryClient={queryClient}>
//       <QueryClientProvider client={queryClient}>
//         {children}
//       </QueryClientProvider>
//     </trpc.Provider>
//   );
// }
