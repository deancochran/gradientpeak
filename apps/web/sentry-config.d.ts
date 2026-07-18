import type { BrowserOptions, Event, EventHint, NodeOptions } from "@sentry/tanstackstart-react";

export const SENTRY_DATA_COLLECTION: NonNullable<NodeOptions["dataCollection"]>;

export function readSentrySampleRate(value: unknown, fallback?: number): number;
export function sanitizeSentryContext(value: unknown): unknown;
export function isExpectedSentryError(error: unknown): boolean;
export function prepareSentryEvent(event: Event, hint?: EventHint): Event | null;
export function createServerSentryOptions(env: Record<string, string | undefined>): NodeOptions;
export function createBrowserSentryOptions(env: Record<string, string | undefined>): BrowserOptions;
export function shouldEnableBrowserReplay(env: Record<string, string | undefined>): boolean;
