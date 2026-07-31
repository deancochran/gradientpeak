import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

import { contractEpochFunctionMiddleware } from "./lib/contract-epoch-middleware";

export const webCsrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [sentryGlobalFunctionMiddleware, contractEpochFunctionMiddleware],
  requestMiddleware: [webCsrfMiddleware, sentryGlobalRequestMiddleware],
}));
