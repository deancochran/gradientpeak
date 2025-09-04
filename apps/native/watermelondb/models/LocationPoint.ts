import { Model } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";

export default class LocationPoint extends Model {
  static table = "location_points";

  static associations = {
    activities: { type: "belongs_to", key: "activity_id" },
  } as const;

  @relation("activities", "activity_id") activity!: any;

  @field("latitude") latitude!: number;
  @field("longitude") longitude!: number;
  @field("altitude") altitude?: number;
  @date("timestamp") timestamp!: Date;
  @field("speed") speed?: number;
  @field("accuracy") accuracy?: number;
}
