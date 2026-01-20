create type "public"."performance_metric_type" as enum ('power', 'pace', 'speed', 'heart_rate');

create type "public"."profile_metric_type" as enum ('weight_kg', 'resting_hr_bpm', 'sleep_hours', 'hrv_ms', 'vo2_max', 'body_fat_pct', 'hydration_level', 'stress_score', 'soreness_level', 'wellness_score');

create sequence "public"."profile_metric_logs_idx_seq";

create sequence "public"."profile_performance_metric_logs_idx_seq";


  create table "public"."profile_metric_logs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "idx" integer not null default nextval('public.profile_metric_logs_idx_seq'::regclass),
    "profile_id" uuid not null,
    "metric_type" public.profile_metric_type not null,
    "value" numeric not null,
    "unit" text not null,
    "reference_activity_id" uuid,
    "notes" text,
    "recorded_at" timestamp with time zone not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."profile_performance_metric_logs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "idx" integer not null default nextval('public.profile_performance_metric_logs_idx_seq'::regclass),
    "profile_id" uuid not null,
    "category" public.activity_category not null,
    "type" public.performance_metric_type not null,
    "value" numeric not null,
    "unit" text not null,
    "duration_seconds" integer,
    "reference_activity_id" uuid,
    "notes" text,
    "recorded_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter sequence "public"."profile_metric_logs_idx_seq" owned by "public"."profile_metric_logs"."idx";

alter sequence "public"."profile_performance_metric_logs_idx_seq" owned by "public"."profile_performance_metric_logs"."idx";

CREATE INDEX idx_profile_metric_logs_profile ON public.profile_metric_logs USING btree (profile_id, recorded_at DESC);

CREATE INDEX idx_profile_metric_logs_recorded_at ON public.profile_metric_logs USING btree (recorded_at DESC);

CREATE INDEX idx_profile_metric_logs_reference_activity ON public.profile_metric_logs USING btree (reference_activity_id) WHERE (reference_activity_id IS NOT NULL);

CREATE INDEX idx_profile_metric_logs_temporal_lookup ON public.profile_metric_logs USING btree (profile_id, metric_type, recorded_at DESC);

CREATE INDEX idx_profile_performance_metric_logs_profile ON public.profile_performance_metric_logs USING btree (profile_id, recorded_at DESC);

CREATE INDEX idx_profile_performance_metric_logs_recorded_at ON public.profile_performance_metric_logs USING btree (recorded_at DESC);

CREATE INDEX idx_profile_performance_metric_logs_reference_activity ON public.profile_performance_metric_logs USING btree (reference_activity_id) WHERE (reference_activity_id IS NOT NULL);

CREATE INDEX idx_profile_performance_metric_logs_temporal_lookup ON public.profile_performance_metric_logs USING btree (profile_id, category, type, duration_seconds, recorded_at DESC);

CREATE UNIQUE INDEX profile_metric_logs_idx_key ON public.profile_metric_logs USING btree (idx);

CREATE UNIQUE INDEX profile_metric_logs_pkey ON public.profile_metric_logs USING btree (id);

CREATE UNIQUE INDEX profile_performance_metric_logs_idx_key ON public.profile_performance_metric_logs USING btree (idx);

CREATE UNIQUE INDEX profile_performance_metric_logs_pkey ON public.profile_performance_metric_logs USING btree (id);

alter table "public"."profile_metric_logs" add constraint "profile_metric_logs_pkey" PRIMARY KEY using index "profile_metric_logs_pkey";

alter table "public"."profile_performance_metric_logs" add constraint "profile_performance_metric_logs_pkey" PRIMARY KEY using index "profile_performance_metric_logs_pkey";

alter table "public"."profile_metric_logs" add constraint "profile_metric_logs_idx_key" UNIQUE using index "profile_metric_logs_idx_key";

alter table "public"."profile_metric_logs" add constraint "profile_metric_logs_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."profile_metric_logs" validate constraint "profile_metric_logs_profile_id_fkey";

alter table "public"."profile_metric_logs" add constraint "profile_metric_logs_reference_activity_id_fkey" FOREIGN KEY (reference_activity_id) REFERENCES public.activities(id) ON DELETE SET NULL not valid;

alter table "public"."profile_metric_logs" validate constraint "profile_metric_logs_reference_activity_id_fkey";

alter table "public"."profile_metric_logs" add constraint "profile_metric_logs_value_check" CHECK ((value >= (0)::numeric)) not valid;

alter table "public"."profile_metric_logs" validate constraint "profile_metric_logs_value_check";

alter table "public"."profile_performance_metric_logs" add constraint "profile_performance_metric_logs_duration_seconds_check" CHECK ((duration_seconds > 0)) not valid;

alter table "public"."profile_performance_metric_logs" validate constraint "profile_performance_metric_logs_duration_seconds_check";

alter table "public"."profile_performance_metric_logs" add constraint "profile_performance_metric_logs_idx_key" UNIQUE using index "profile_performance_metric_logs_idx_key";

alter table "public"."profile_performance_metric_logs" add constraint "profile_performance_metric_logs_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."profile_performance_metric_logs" validate constraint "profile_performance_metric_logs_profile_id_fkey";

alter table "public"."profile_performance_metric_logs" add constraint "profile_performance_metric_logs_reference_activity_id_fkey" FOREIGN KEY (reference_activity_id) REFERENCES public.activities(id) ON DELETE SET NULL not valid;

alter table "public"."profile_performance_metric_logs" validate constraint "profile_performance_metric_logs_reference_activity_id_fkey";

alter table "public"."profile_performance_metric_logs" add constraint "profile_performance_metric_logs_value_check" CHECK ((value > (0)::numeric)) not valid;

alter table "public"."profile_performance_metric_logs" validate constraint "profile_performance_metric_logs_value_check";

grant delete on table "public"."profile_metric_logs" to "anon";

grant insert on table "public"."profile_metric_logs" to "anon";

grant references on table "public"."profile_metric_logs" to "anon";

grant select on table "public"."profile_metric_logs" to "anon";

grant trigger on table "public"."profile_metric_logs" to "anon";

grant truncate on table "public"."profile_metric_logs" to "anon";

grant update on table "public"."profile_metric_logs" to "anon";

grant delete on table "public"."profile_metric_logs" to "authenticated";

grant insert on table "public"."profile_metric_logs" to "authenticated";

grant references on table "public"."profile_metric_logs" to "authenticated";

grant select on table "public"."profile_metric_logs" to "authenticated";

grant trigger on table "public"."profile_metric_logs" to "authenticated";

grant truncate on table "public"."profile_metric_logs" to "authenticated";

grant update on table "public"."profile_metric_logs" to "authenticated";

grant delete on table "public"."profile_metric_logs" to "service_role";

grant insert on table "public"."profile_metric_logs" to "service_role";

grant references on table "public"."profile_metric_logs" to "service_role";

grant select on table "public"."profile_metric_logs" to "service_role";

grant trigger on table "public"."profile_metric_logs" to "service_role";

grant truncate on table "public"."profile_metric_logs" to "service_role";

grant update on table "public"."profile_metric_logs" to "service_role";

grant delete on table "public"."profile_performance_metric_logs" to "anon";

grant insert on table "public"."profile_performance_metric_logs" to "anon";

grant references on table "public"."profile_performance_metric_logs" to "anon";

grant select on table "public"."profile_performance_metric_logs" to "anon";

grant trigger on table "public"."profile_performance_metric_logs" to "anon";

grant truncate on table "public"."profile_performance_metric_logs" to "anon";

grant update on table "public"."profile_performance_metric_logs" to "anon";

grant delete on table "public"."profile_performance_metric_logs" to "authenticated";

grant insert on table "public"."profile_performance_metric_logs" to "authenticated";

grant references on table "public"."profile_performance_metric_logs" to "authenticated";

grant select on table "public"."profile_performance_metric_logs" to "authenticated";

grant trigger on table "public"."profile_performance_metric_logs" to "authenticated";

grant truncate on table "public"."profile_performance_metric_logs" to "authenticated";

grant update on table "public"."profile_performance_metric_logs" to "authenticated";

grant delete on table "public"."profile_performance_metric_logs" to "service_role";

grant insert on table "public"."profile_performance_metric_logs" to "service_role";

grant references on table "public"."profile_performance_metric_logs" to "service_role";

grant select on table "public"."profile_performance_metric_logs" to "service_role";

grant trigger on table "public"."profile_performance_metric_logs" to "service_role";

grant truncate on table "public"."profile_performance_metric_logs" to "service_role";

grant update on table "public"."profile_performance_metric_logs" to "service_role";

CREATE TRIGGER update_profile_metric_logs_updated_at BEFORE UPDATE ON public.profile_metric_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profile_performance_metric_logs_updated_at BEFORE UPDATE ON public.profile_performance_metric_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


