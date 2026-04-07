import { getGradientPeakAuth } from "@repo/auth/server";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(getGradientPeakAuth());

export const GET = handler.GET;
export const POST = handler.POST;
