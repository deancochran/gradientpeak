import type { DrizzleDbClient, EventRow } from "@repo/db";
import type { NormalizedIcalEvent } from "../lib/integrations/ical/parser";

export type ExistingFeedEvent = Pick<
  EventRow,
  "id" | "external_calendar_id" | "external_event_id" | "occurrence_key"
> & {
  occurrence_key: string;
};

export type IcalFeedListRow = Pick<EventRow, "external_calendar_id" | "integration_account_id"> & {
  updated_at: string | null;
};

export interface IcalFeedRepository {
  getExistingFeedEvents(input: { profileId: string; feedId: string }): Promise<ExistingFeedEvent[]>;
  listFeedRows(profileId: string): Promise<IcalFeedListRow[]>;
  listImportedEventIds(input: { profileId: string; feedId: string }): Promise<string[]>;
  removeImportedEvents(input: { profileId: string; feedId: string; ids: string[] }): Promise<void>;
  upsertImportedEvent(input: {
    profileId: string;
    feedId: string;
    feedUrl: string;
    event: NormalizedIcalEvent;
  }): Promise<void>;
}

export interface CreateIcalFeedRepositoryOptions {
  db: DrizzleDbClient;
}
