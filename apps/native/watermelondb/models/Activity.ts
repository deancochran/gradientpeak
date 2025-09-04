import { Model } from "@nozbe/watermelondb";
import { children, date, field, text } from "@nozbe/watermelondb/decorators";

export default class Activity extends Model {
  static table = "activities";

  static associations = {
    location_points: { type: "has_many", foreignKey: "activity_id" },
  } as const;

  @text("profile_id") profileId!: string;
  @date("started_at") startedAt!: Date;
  @date("ended_at") endedAt?: Date;
  @field("distance") distance?: number;
  @field("duration") duration?: number;

  @text("sync_status") syncStatus!:
    | "local_only"
    | "syncing"
    | "synced"
    | "sync_failed";
  @text("local_fit_file_path") localFitFilePath?: string;
  @text("cloud_storage_path") cloudStoragePath?: string;
  @text("sync_error_message") syncErrorMessage?: string;
  @date("synced_at") syncedAt?: Date;

  @children("location_points") locationPoints!: any;
}
