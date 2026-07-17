export interface FeedActivityItem {
  id: string;
  profile_id: string;
  name: string;
  type: string | null;
  activity_kind: "single" | "multisport" | "unknown";
  activity_categories: string[];
  started_at: string;
  distance_meters: number;
  elapsed_seconds: number;
  avg_heart_rate: number | null;
  avg_power: number | null;
  avg_cadence: number | null;
  elevation_gain_meters: number | null;
  calories: number | null;
  polyline: string | null;
  likes_count: number;
  comments_count: number;
  is_private: boolean;
  profile?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  };
  has_liked: boolean;
  derived?: {
    tss: number | null;
    intensity_factor: number | null;
    computed_as_of: string;
  } | null;
}
