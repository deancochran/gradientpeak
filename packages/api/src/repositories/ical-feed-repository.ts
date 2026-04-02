import type { DrizzleDbClient } from "@repo/db";
import type { NormalizedIcalEvent } from "../lib/integrations/ical/parser";

export type ExistingFeedEvent = {
  id: string;
  external_calendar_id: string | null;
  external_event_id: string | null;
  occurrence_key: string;
};

export type IcalFeedListRow = {
  external_calendar_id: string | null;
  integration_account_id: string | null;
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
