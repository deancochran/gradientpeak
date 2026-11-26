import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { getConfiguredAppBaseUrl } from "./app-url";

type ShareEntity = "activity" | "activity-plan" | "training-plan" | "route";

const shareInputSchema = z.object({ id: z.string().uuid() }).strict();

export function getPublicSharePath(entity: ShareEntity, id: string) {
  switch (entity) {
    case "activity-plan":
      return `/share/activity-plans/${id}`;
    case "activity":
      return `/share/activities/${id}`;
    case "training-plan":
      return `/share/training-plans/${id}`;
    case "route":
      return `/share/routes/${id}`;
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
  return { caller: appRouter.createCaller(context) };
}

export const loadPublicActivityPlan = createServerFn({ method: "GET" })
  .validator(shareInputSchema)
  .handler(async ({ data }) => {
    const { caller } = await createPublicShareCaller();
    const activityPlan = await caller.publicShare.activityPlan({ id: data.id });
    return activityPlan
      ? {
          activityPlan,
          canonicalUrl: getPublicShareUrl(
            getConfiguredAppBaseUrl(),
            "activity-plan",
            activityPlan.id,
          ),
        }
      : null;
  });

export const loadPublicActivity = createServerFn({ method: "GET" })
  .validator(shareInputSchema)
  .handler(async ({ data }) => {
    const { caller } = await createPublicShareCaller();
    const activity = await caller.publicShare.activity({ id: data.id });
    return activity
      ? {
          activity,
          canonicalUrl: getPublicShareUrl(getConfiguredAppBaseUrl(), "activity", activity.id),
        }
      : null;
  });

export const loadPublicTrainingPlan = createServerFn({ method: "GET" })
  .validator(shareInputSchema)
  .handler(async ({ data }) => {
    const { caller } = await createPublicShareCaller();
    const trainingPlan = await caller.publicShare.trainingPlan({ id: data.id });
    return trainingPlan
      ? {
          trainingPlan,
          canonicalUrl: getPublicShareUrl(
            getConfiguredAppBaseUrl(),
            "training-plan",
            trainingPlan.id,
          ),
        }
      : null;
  });

export const loadPublicRoute = createServerFn({ method: "GET" })
  .validator(shareInputSchema)
  .handler(async ({ data }) => {
    const { caller } = await createPublicShareCaller();
    const route = await caller.publicShare.route({ id: data.id });
    return route
      ? {
          route,
          canonicalUrl: getPublicShareUrl(getConfiguredAppBaseUrl(), "route", route.id),
        }
      : null;
  });
