"use client";

import {
  normalizeGradientPeakAuthClientSession,
  resolveGradientPeakAuthBaseUrl,
} from "@repo/auth/client";
import { createGradientPeakWebAuthClient } from "@repo/auth/client/web";

function getAppBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

export const authClient = createGradientPeakWebAuthClient({
  baseURL: resolveGradientPeakAuthBaseUrl({
    appBaseUrl: getAppBaseUrl(),
  }),
});

export function normalizeWebAuthSession(session: unknown) {
  return normalizeGradientPeakAuthClientSession(session as any, "cookie");
}

export function toAbsoluteWebUrl(path: string) {
  return new URL(path, getAppBaseUrl()).toString();
}
