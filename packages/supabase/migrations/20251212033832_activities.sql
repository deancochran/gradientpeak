alter table "public"."activities" drop constraint "activities_avg_cadence_check";

alter table "public"."activities" drop constraint "activities_avg_heart_rate_check";

alter table "public"."activities" drop constraint "activities_avg_power_check";

alter table "public"."activities" drop constraint "activities_avg_speed_check";

alter table "public"."activities" drop constraint "activities_calories_check";

alter table "public"."activities" drop constraint "activities_decoupling_check";

alter table "public"."activities" drop constraint "activities_distance_check";

alter table "public"."activities" drop constraint "activities_efficiency_factor_check";

alter table "public"."activities" drop constraint "activities_elapsed_time_check";

alter table "public"."activities" drop constraint "activities_hr_zone_1_time_check";

alter table "public"."activities" drop constraint "activities_hr_zone_2_time_check";

alter table "public"."activities" drop constraint "activities_hr_zone_3_time_check";

alter table "public"."activities" drop constraint "activities_hr_zone_4_time_check";

alter table "public"."activities" drop constraint "activities_hr_zone_5_time_check";

alter table "public"."activities" drop constraint "activities_intensity_factor_check";

alter table "public"."activities" drop constraint "activities_max_cadence_check";

alter table "public"."activities" drop constraint "activities_max_heart_rate_check";

alter table "public"."activities" drop constraint "activities_max_power_check";

alter table "public"."activities" drop constraint "activities_max_speed_check";

alter table "public"."activities" drop constraint "activities_moving_time_check";

alter table "public"."activities" drop constraint "activities_normalized_power_check";

alter table "public"."activities" drop constraint "activities_power_weight_ratio_check";

alter table "public"."activities" drop constraint "activities_power_zone_1_time_check";

alter table "public"."activities" drop constraint "activities_power_zone_2_time_check";

alter table "public"."activities" drop constraint "activities_power_zone_3_time_check";

alter table "public"."activities" drop constraint "activities_power_zone_4_time_check";

alter table "public"."activities" drop constraint "activities_power_zone_5_time_check";

alter table "public"."activities" drop constraint "activities_power_zone_6_time_check";

alter table "public"."activities" drop constraint "activities_power_zone_7_time_check";

alter table "public"."activities" drop constraint "activities_profile_age_check";

alter table "public"."activities" drop constraint "activities_profile_ftp_check";

alter table "public"."activities" drop constraint "activities_profile_recovery_time_check";

alter table "public"."activities" drop constraint "activities_profile_threshold_hr_check";

alter table "public"."activities" drop constraint "activities_profile_training_load_check";

alter table "public"."activities" drop constraint "activities_profile_weight_kg_check";

alter table "public"."activities" drop constraint "activities_total_ascent_check";

alter table "public"."activities" drop constraint "activities_total_descent_check";

alter table "public"."activities" drop constraint "activities_total_work_check";

alter table "public"."activities" drop constraint "activities_training_stress_score_check";

alter table "public"."activities" drop constraint "activities_variability_index_check";

drop index if exists "public"."idx_activities_activity_category";

drop index if exists "public"."idx_activities_activity_location";

drop index if exists "public"."idx_activities_planned_activity_id";

drop index if exists "public"."idx_activities_profile_id";

drop index if exists "public"."idx_activities_provider_external";

drop index if exists "public"."idx_activities_started_at";

alter table "public"."activities" drop column "activity_category";

alter table "public"."activities" drop column "activity_location";

alter table "public"."activities" drop column "avg_cadence";

alter table "public"."activities" drop column "avg_grade";

alter table "public"."activities" drop column "avg_heart_rate";

alter table "public"."activities" drop column "avg_power";

alter table "public"."activities" drop column "avg_speed";

alter table "public"."activities" drop column "avg_temperature";

alter table "public"."activities" drop column "calories";

alter table "public"."activities" drop column "decoupling";

alter table "public"."activities" drop column "distance";

alter table "public"."activities" drop column "efficiency_factor";

alter table "public"."activities" drop column "elapsed_time";

alter table "public"."activities" drop column "elevation_gain_per_km";

alter table "public"."activities" drop column "hr_zone_1_time";

alter table "public"."activities" drop column "hr_zone_2_time";

alter table "public"."activities" drop column "hr_zone_3_time";

alter table "public"."activities" drop column "hr_zone_4_time";

alter table "public"."activities" drop column "hr_zone_5_time";

alter table "public"."activities" drop column "intensity_factor";

alter table "public"."activities" drop column "max_cadence";

alter table "public"."activities" drop column "max_heart_rate";

alter table "public"."activities" drop column "max_hr_pct_threshold";

alter table "public"."activities" drop column "max_power";

alter table "public"."activities" drop column "max_speed";

alter table "public"."activities" drop column "max_temperature";

alter table "public"."activities" drop column "moving_time";

alter table "public"."activities" drop column "normalized_power";

alter table "public"."activities" drop column "power_heart_rate_ratio";

alter table "public"."activities" drop column "power_weight_ratio";

alter table "public"."activities" drop column "power_zone_1_time";

alter table "public"."activities" drop column "power_zone_2_time";

alter table "public"."activities" drop column "power_zone_3_time";

alter table "public"."activities" drop column "power_zone_4_time";

alter table "public"."activities" drop column "power_zone_5_time";

alter table "public"."activities" drop column "power_zone_6_time";

alter table "public"."activities" drop column "power_zone_7_time";

alter table "public"."activities" drop column "profile_age";

alter table "public"."activities" drop column "profile_ftp";

alter table "public"."activities" drop column "profile_recovery_time";

alter table "public"."activities" drop column "profile_threshold_hr";

alter table "public"."activities" drop column "profile_training_load";

alter table "public"."activities" drop column "profile_weight_kg";

alter table "public"."activities" drop column "total_ascent";

alter table "public"."activities" drop column "total_descent";

alter table "public"."activities" drop column "total_work";

alter table "public"."activities" drop column "training_stress_score";

alter table "public"."activities" drop column "variability_index";

alter table "public"."activities" drop column "weather_condition";

alter table "public"."activities" add column "distance_meters" integer not null default 0;

alter table "public"."activities" add column "duration_seconds" integer not null default 0;

alter table "public"."activities" add column "hr_zone_seconds" integer[];

alter table "public"."activities" add column "location" text;

alter table "public"."activities" add column "metrics" jsonb not null default '{}'::jsonb;

alter table "public"."activities" add column "moving_seconds" integer not null default 0;

alter table "public"."activities" add column "power_zone_seconds" integer[];

alter table "public"."activities" add column "profile_snapshot" jsonb;

alter table "public"."activities" add column "type" text not null;

CREATE INDEX idx_activities_external ON public.activities USING btree (provider, external_id) WHERE (provider IS NOT NULL);

CREATE INDEX idx_activities_hr_zones ON public.activities USING gin (hr_zone_seconds);

CREATE INDEX idx_activities_location ON public.activities USING btree (location) WHERE (location IS NOT NULL);

CREATE INDEX idx_activities_metrics_all ON public.activities USING gin (metrics jsonb_path_ops);

CREATE INDEX idx_activities_metrics_hr ON public.activities USING gin (((metrics -> 'avg_hr'::text)));

CREATE INDEX idx_activities_metrics_power ON public.activities USING gin (((metrics -> 'avg_power'::text)));

CREATE INDEX idx_activities_metrics_tss ON public.activities USING gin (((metrics -> 'tss'::text)));

CREATE INDEX idx_activities_name_search ON public.activities USING gin (to_tsvector('english'::regconfig, name));

CREATE INDEX idx_activities_planned ON public.activities USING btree (planned_activity_id) WHERE (planned_activity_id IS NOT NULL);

CREATE INDEX idx_activities_power_zones ON public.activities USING gin (power_zone_seconds);

CREATE INDEX idx_activities_profile_started ON public.activities USING btree (profile_id, started_at DESC);

CREATE INDEX idx_activities_started ON public.activities USING btree (started_at DESC);

CREATE INDEX idx_activities_type ON public.activities USING btree (type);

alter table "public"."activities" add constraint "activities_distance_meters_check" CHECK ((distance_meters >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_distance_meters_check";

alter table "public"."activities" add constraint "activities_duration_seconds_check" CHECK ((duration_seconds >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_duration_seconds_check";

alter table "public"."activities" add constraint "activities_moving_seconds_check" CHECK ((moving_seconds >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_moving_seconds_check";

alter table "public"."activities" add constraint "chk_moving_time" CHECK (((moving_seconds >= 0) AND (moving_seconds <= duration_seconds))) not valid;

alter table "public"."activities" validate constraint "chk_moving_time";
