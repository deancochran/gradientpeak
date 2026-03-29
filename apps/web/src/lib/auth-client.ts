"use client";

import { createGradientPeakWebAuthClient } from "@repo/auth/web-client";

export const authClient = createGradientPeakWebAuthClient("/api/auth");
