alter table "public"."activities" drop constraint "activities_avg_target_adherence_check";

drop index if exists "public"."idx_activities_hr_zones";

drop index if exists "public"."idx_activities_metrics_all";

drop index if exists "public"."idx_activities_metrics_hr";

drop index if exists "public"."idx_activities_metrics_power";

drop index if exists "public"."idx_activities_metrics_tss";

drop index if exists "public"."idx_activities_power_zones";

alter table "public"."activities" drop column "avg_target_adherence";

alter table "public"."activities" drop column "hr_zone_seconds";

alter table "public"."activities" drop column "metrics";

alter table "public"."activities" drop column "power_zone_seconds";

alter table "public"."activities" drop column "profile_snapshot";

alter table "public"."activities" add column "avg_cadence" integer;

alter table "public"."activities" add column "avg_heart_rate" integer;

alter table "public"."activities" add column "avg_power" integer;

alter table "public"."activities" add column "avg_speed_mps" numeric(6,2);

alter table "public"."activities" add column "calories" integer;

alter table "public"."activities" add column "elevation_gain_meters" numeric(10,2);

alter table "public"."activities" add column "elevation_loss_meters" numeric(10,2);

alter table "public"."activities" add column "fit_file_size" integer;

alter table "public"."activities" add column "hr_zone_1_seconds" integer;

alter table "public"."activities" add column "hr_zone_2_seconds" integer;

alter table "public"."activities" add column "hr_zone_3_seconds" integer;

alter table "public"."activities" add column "hr_zone_4_seconds" integer;

alter table "public"."activities" add column "hr_zone_5_seconds" integer;

alter table "public"."activities" add column "intensity_factor" numeric(4,3);

alter table "public"."activities" add column "max_cadence" integer;

alter table "public"."activities" add column "max_heart_rate" integer;

alter table "public"."activities" add column "max_power" integer;

alter table "public"."activities" add column "max_speed_mps" numeric(6,2);

alter table "public"."activities" add column "normalized_power" integer;

alter table "public"."activities" add column "power_zone_1_seconds" integer;

alter table "public"."activities" add column "power_zone_2_seconds" integer;

alter table "public"."activities" add column "power_zone_3_seconds" integer;

alter table "public"."activities" add column "power_zone_4_seconds" integer;

alter table "public"."activities" add column "power_zone_5_seconds" integer;

alter table "public"."activities" add column "power_zone_6_seconds" integer;

alter table "public"."activities" add column "power_zone_7_seconds" integer;

alter table "public"."activities" add column "processing_error" text;

alter table "public"."activities" add column "training_stress_score" integer;

CREATE INDEX idx_activities_avg_cadence ON public.activities USING btree (avg_cadence DESC) WHERE (avg_cadence IS NOT NULL);

CREATE INDEX idx_activities_avg_heart_rate ON public.activities USING btree (avg_heart_rate DESC) WHERE (avg_heart_rate IS NOT NULL);

CREATE INDEX idx_activities_avg_power ON public.activities USING btree (avg_power DESC) WHERE (avg_power IS NOT NULL);

CREATE INDEX idx_activities_avg_speed ON public.activities USING btree (avg_speed_mps DESC) WHERE (avg_speed_mps IS NOT NULL);

CREATE INDEX idx_activities_calories ON public.activities USING btree (calories DESC) WHERE (calories IS NOT NULL);

CREATE INDEX idx_activities_distance ON public.activities USING btree (distance_meters DESC);

CREATE INDEX idx_activities_duration ON public.activities USING btree (duration_seconds DESC);

CREATE INDEX idx_activities_elevation_gain ON public.activities USING btree (elevation_gain_meters DESC) WHERE (elevation_gain_meters IS NOT NULL);

CREATE INDEX idx_activities_intensity_factor ON public.activities USING btree (intensity_factor DESC) WHERE (intensity_factor IS NOT NULL);

CREATE INDEX idx_activities_max_heart_rate ON public.activities USING btree (max_heart_rate DESC) WHERE (max_heart_rate IS NOT NULL);

CREATE INDEX idx_activities_max_power ON public.activities USING btree (max_power DESC) WHERE (max_power IS NOT NULL);

CREATE INDEX idx_activities_normalized_power ON public.activities USING btree (normalized_power DESC) WHERE (normalized_power IS NOT NULL);

CREATE INDEX idx_activities_processing_status ON public.activities USING btree (processing_status) WHERE (processing_status IS NOT NULL);

CREATE INDEX idx_activities_profile_distance ON public.activities USING btree (profile_id, distance_meters DESC);

CREATE INDEX idx_activities_profile_duration ON public.activities USING btree (profile_id, duration_seconds DESC);

CREATE INDEX idx_activities_profile_power ON public.activities USING btree (profile_id, avg_power DESC) WHERE (avg_power IS NOT NULL);

CREATE INDEX idx_activities_profile_tss ON public.activities USING btree (profile_id, training_stress_score DESC) WHERE (training_stress_score IS NOT NULL);

CREATE INDEX idx_activities_tss ON public.activities USING btree (training_stress_score DESC) WHERE (training_stress_score IS NOT NULL);


