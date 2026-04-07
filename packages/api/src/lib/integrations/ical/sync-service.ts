type ExistingFeedEvent = {
  id: string;
  external_calendar_id: string | null;
  external_event_id: string | null;
  occurrence_key: string;
};

interface IcalFeedRepository {
  getExistingFeedEvents(input: { profileId: string; feedId: string }): Promise<ExistingFeedEvent[]>;
  listFeedRows(profileId: string): Promise<
    Array<{
      integration_account_id: string | null;
      external_calendar_id: string | null;
      updated_at: string | null;
    }>
  >;
  listImportedEventIds(input: { profileId: string; feedId: string }): Promise<string[]>;
  removeImportedEvents(input: { profileId: string; feedId: string; ids: string[] }): Promise<void>;
  upsertImportedEvent(input: {
    profileId: string;
    feedId: string;
    feedUrl: string;
    event: NormalizedIcalEvent;
  }): Promise<void>;
}

import { type NormalizedIcalEvent, normalizeIcalEvent, parseIcalEvents } from "./parser";

type EventIdentity = {
  externalCalendarId: string;
  externalEventId: string;
  occurrenceKey: string;
};

export class IcalSyncError extends Error {
  constructor(
    message: string,
    public readonly code: "BAD_REQUEST" | "INTERNAL_SERVER_ERROR",
  ) {
    super(message);
    this.name = "IcalSyncError";
  }
}

export type IcalSyncResult = {
  feed_id: string;
  feed_url: string;
  imported: number;
  updated: number;
  removed: number;
  synced_at: string;
  cache_tags: string[];
};

export type IcalFeedListItem = {
  feed_id: string;
  feed_url: string;
  event_count: number;
  last_event_updated_at: string | null;
};

function identityKey(identity: EventIdentity): string {
  return [identity.externalCalendarId, identity.externalEventId, identity.occurrenceKey].join("::");
}

function normalizeFeedUrl(url: string): string {
  return new URL(url).toString();
}

export class IcalSyncService {
  constructor(private readonly repository: IcalFeedRepository) {}

  async syncFeed(input: {
    profileId: string;
    feedId: string;
    feedUrl: string;
  }): Promise<IcalSyncResult> {
    const normalizedFeedUrl = normalizeFeedUrl(input.feedUrl);
    const syncedAt = new Date().toISOString();

    const icsText = await this.fetchFeed(normalizedFeedUrl);
    const parsedEvents = parseIcalEvents(icsText);
    const normalizedEvents = parsedEvents.map((event) => normalizeIcalEvent(event));

    const existingFeedEvents = await this.getExistingFeedEvents({
      profileId: input.profileId,
      feedId: input.feedId,
    });

    const existingByIdentity = new Map<string, ExistingFeedEvent>();
    for (const existing of existingFeedEvents) {
      if (!existing.external_calendar_id || !existing.external_event_id) continue;
      existingByIdentity.set(
        identityKey({
          externalCalendarId: existing.external_calendar_id,
          externalEventId: existing.external_event_id,
          occurrenceKey: existing.occurrence_key,
        }),
        existing,
      );
    }

    const incomingKeys = new Set<string>();
    let imported = 0;
    let updated = 0;

    for (const event of normalizedEvents) {
      const key = identityKey({
        externalCalendarId: normalizedFeedUrl,
        externalEventId: event.externalEventId,
        occurrenceKey: event.occurrenceKey,
      });
      incomingKeys.add(key);

      if (existingByIdentity.has(key)) {
        updated += 1;
      } else {
        imported += 1;
      }

      await this.upsertEvent({
        profileId: input.profileId,
        feedId: input.feedId,
        feedUrl: normalizedFeedUrl,
        event,
      });
    }

    const staleEventIds = existingFeedEvents
      .filter((existing) => {
        if (!existing.external_calendar_id || !existing.external_event_id) {
          return true;
        }

        return !incomingKeys.has(
          identityKey({
            externalCalendarId: existing.external_calendar_id,
            externalEventId: existing.external_event_id,
            occurrenceKey: existing.occurrence_key,
          }),
        );
      })
      .map((existing) => existing.id);

    if (staleEventIds.length > 0) {
      await this.repository.removeImportedEvents({
        profileId: input.profileId,
        feedId: input.feedId,
        ids: staleEventIds,
      });
    }

    return {
      feed_id: input.feedId,
      feed_url: normalizedFeedUrl,
      imported,
      updated,
      removed: staleEventIds.length,
      synced_at: syncedAt,
      cache_tags: ["integrations.ical.feeds", "events.imported"],
    };
  }

  async listFeeds(profileId: string): Promise<IcalFeedListItem[]> {
    const data = await this.repository.listFeedRows(profileId);

    const grouped = new Map<string, IcalFeedListItem>();

    for (const row of data ?? []) {
      const feedId = row.integration_account_id;
      const feedUrl = row.external_calendar_id;
      if (!feedId || !feedUrl) continue;

      const groupKey = `${feedId}::${feedUrl}`;
      const existing = grouped.get(groupKey);

      if (!existing) {
        grouped.set(groupKey, {
          feed_id: feedId,
          feed_url: feedUrl,
          event_count: 1,
          last_event_updated_at: row.updated_at,
        });
        continue;
      }

      existing.event_count += 1;
      if (
        row.updated_at &&
        (!existing.last_event_updated_at || row.updated_at > existing.last_event_updated_at)
      ) {
        existing.last_event_updated_at = row.updated_at;
      }
    }

    return [...grouped.values()].sort((a, b) => {
      const aTime = a.last_event_updated_at ?? "";
      const bTime = b.last_event_updated_at ?? "";
      return bTime.localeCompare(aTime);
    });
  }

  async removeFeed(input: {
    profileId: string;
    feedId: string;
    purgeEvents: boolean;
  }): Promise<{ success: true; removed_events: number; cache_tags: string[] }> {
    if (!input.purgeEvents) {
      return {
        success: true,
        removed_events: 0,
        cache_tags: ["integrations.ical.feeds"],
      };
    }

    const ids = await this.repository.listImportedEventIds({
      profileId: input.profileId,
      feedId: input.feedId,
    });

    if (ids.length > 0) {
      await this.repository.removeImportedEvents({
        profileId: input.profileId,
        feedId: input.feedId,
        ids,
      });
    }

    return {
      success: true,
      removed_events: ids.length,
      cache_tags: ["integrations.ical.feeds", "events.imported"],
    };
  }

  private async fetchFeed(feedUrl: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(feedUrl);
    } catch {
      throw new IcalSyncError("Unable to fetch iCal feed", "BAD_REQUEST");
    }

    if (!response.ok) {
      throw new IcalSyncError(`Unable to fetch iCal feed (${response.status})`, "BAD_REQUEST");
    }

    return response.text();
  }

  private async getExistingFeedEvents(input: {
    profileId: string;
    feedId: string;
  }): Promise<ExistingFeedEvent[]> {
    return this.repository.getExistingFeedEvents(input);
  }

  private async upsertEvent(input: {
    profileId: string;
    feedId: string;
    feedUrl: string;
    event: NormalizedIcalEvent;
  }): Promise<void> {
    await this.repository.upsertImportedEvent(input);
  }
}
