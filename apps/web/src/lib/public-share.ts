import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

type ShareEntity = "activity" | "activity-plan" | "training-plan";

const shareInputSchema = z.object({ id: z.string().uuid() }).strict();

function getOriginFromHeaders(headers: Headers) {
  const forwardedHost = headers.get("x-forwarded-host");
  const host = forwardedHost ?? headers.get("host") ?? "localhost:3000";
  const forwardedProto = headers.get("x-forwarded-proto");
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function getPublicSharePath(entity: ShareEntity, id: string) {
  switch (entity) {
    case "activity-plan":
      return `/share/activity-plans/${id}`;
    case "activity":
      return `/share/activities/${id}`;
    case "training-plan":
      return `/share/training-plans/${id}`;
  }
}

export function getPublicShareUrl(origin: string, entity: ShareEntity, id: string) {
  return new URL(getPublicSharePath(entity, id), origin).toString();
}

async function createPublicShareCaller() {
  const [{ appRouter, createApiContext }, { db }] = await Promise.all([
    import("@repo/api/server"),
    import("@repo/db/client"),
  ]);
  const headers = getRequestHeaders();
  const context = await createApiContext({
    headers,
    auth: { session: null },
    db,
  });
  return { caller: appRouter.createCaller(context), origin: getOriginFromHeaders(headers) };
}

export const loadPublicActivityPlan = createServerFn({ method: "GET" })
  .validator(shareInputSchema)
  .handler(async ({ data }) => {
    const { caller, origin } = await createPublicShareCaller();
    const activityPlan = await caller.publicShare.activityPlan({ id: data.id });
    return activityPlan
      ? {
          activityPlan,
          canonicalUrl: getPublicShareUrl(origin, "activity-plan", activityPlan.id),
        }
      : null;
  });

export const loadPublicActivity = createServerFn({ method: "GET" })
  .validator(shareInputSchema)
  .handler(async ({ data }) => {
    const { caller, origin } = await createPublicShareCaller();
    const activity = await caller.publicShare.activity({ id: data.id });
    return activity
      ? {
          activity,
          canonicalUrl: getPublicShareUrl(origin, "activity", activity.id),
        }
      : null;
  });

export const loadPublicTrainingPlan = createServerFn({ method: "GET" })
  .validator(shareInputSchema)
  .handler(async ({ data }) => {
    const { caller, origin } = await createPublicShareCaller();
    const trainingPlan = await caller.publicShare.trainingPlan({ id: data.id });
    return trainingPlan
      ? {
          trainingPlan,
          canonicalUrl: getPublicShareUrl(origin, "training-plan", trainingPlan.id),
        }
      : null;
  });
