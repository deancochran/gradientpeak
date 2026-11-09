import type { ApiReactUtils } from "./react";

/**
 * Refreshes every client query that can render a profile's name, avatar, or cover image.
 *
 * Query invalidation refetches mounted views now and marks unmounted views stale for their
 * next render. Clients call this after a profile write and when returning to the foreground.
 */
export async function invalidateProfileIdentityQueries(utils: ApiReactUtils): Promise<void> {
  await Promise.all([
    utils.profiles.invalidate(),
    utils.activities.invalidate(),
    utils.activityPlans.invalidate(),
    utils.calendar.invalidate(),
    utils.events.invalidate(),
    utils.feed.invalidate(),
    utils.groups.invalidate(),
    utils.messaging.invalidate(),
    utils.notifications.invalidate(),
    utils.routes.invalidate(),
    utils.social.invalidate(),
    utils.trainingPlans.invalidate(),
  ]);
}
