create type "public"."event_status" as enum ('scheduled', 'completed', 'cancelled');

create type "public"."event_type" as enum ('planned_activity', 'rest_day', 'race', 'custom', 'imported');

create sequence "public"."events_idx_seq";

  create table "public"."events" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "idx" integer not null default nextval('public.events_idx_seq'::regclass),
    "profile_id" uuid not null,
    "event_type" public.event_type not null,
    "status" public.event_status not null default 'scheduled'::public.event_status,
    "title" text not null,
    "description" text,
    "all_day" boolean not null default false,
    "starts_at" timestamp with time zone not null,
    "ends_at" timestamp with time zone,
    "timezone" text not null default 'UTC'::text,
    "activity_plan_id" uuid,
    "training_plan_id" uuid,
    "linked_activity_id" uuid,
    "series_id" uuid,
    "recurrence_rule" text,
    "recurrence_timezone" text,
    "occurrence_key" text not null default ''::text,
    "original_starts_at" timestamp with time zone,
    "source_provider" text,
    "integration_account_id" uuid,
    "external_calendar_id" text,
    "external_event_id" text,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter sequence "public"."events_idx_seq" owned by "public"."events"."idx";

CREATE UNIQUE INDEX events_idx_key ON public.events USING btree (idx);

CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id);

CREATE INDEX idx_events_activity_plan ON public.events USING btree (activity_plan_id) WHERE (activity_plan_id IS NOT NULL);

CREATE INDEX idx_events_event_type_starts_at ON public.events USING btree (event_type, starts_at);

CREATE UNIQUE INDEX idx_events_external_identity_unique ON public.events USING btree (source_provider, integration_account_id, external_calendar_id, external_event_id, occurrence_key) WHERE ((source_provider IS NOT NULL) AND (integration_account_id IS NOT NULL) AND (external_calendar_id IS NOT NULL) AND (external_event_id IS NOT NULL));

CREATE INDEX idx_events_integration_calendar_updated ON public.events USING btree (integration_account_id, external_calendar_id, updated_at) WHERE ((integration_account_id IS NOT NULL) AND (external_calendar_id IS NOT NULL));

CREATE INDEX idx_events_profile_starts_at ON public.events USING btree (profile_id, starts_at);

CREATE INDEX idx_events_profile_status_starts_at ON public.events USING btree (profile_id, status, starts_at);

CREATE UNIQUE INDEX idx_events_series_occurrence_unique ON public.events USING btree (series_id, occurrence_key) WHERE (series_id IS NOT NULL);

CREATE INDEX idx_events_training_plan ON public.events USING btree (training_plan_id) WHERE (training_plan_id IS NOT NULL);

alter table "public"."events" add constraint "events_pkey" PRIMARY KEY using index "events_pkey";

alter table "public"."events" add constraint "events_activity_plan_id_fkey" FOREIGN KEY (activity_plan_id) REFERENCES public.activity_plans(id) ON DELETE SET NULL not valid;

alter table "public"."events" validate constraint "events_activity_plan_id_fkey";

alter table "public"."events" add constraint "events_external_calendar_non_empty" CHECK (((external_calendar_id IS NULL) OR (btrim(external_calendar_id) <> ''::text))) not valid;

alter table "public"."events" validate constraint "events_external_calendar_non_empty";

alter table "public"."events" add constraint "events_external_event_non_empty" CHECK (((external_event_id IS NULL) OR (btrim(external_event_id) <> ''::text))) not valid;

alter table "public"."events" validate constraint "events_external_event_non_empty";

alter table "public"."events" add constraint "events_idx_key" UNIQUE using index "events_idx_key";

alter table "public"."events" add constraint "events_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."events" validate constraint "events_profile_id_fkey";

alter table "public"."events" add constraint "events_recurrence_timezone_requires_rule" CHECK (((recurrence_timezone IS NULL) OR (recurrence_rule IS NOT NULL))) not valid;

alter table "public"."events" validate constraint "events_recurrence_timezone_requires_rule";

alter table "public"."events" add constraint "events_series_id_fkey" FOREIGN KEY (series_id) REFERENCES public.events(id) ON DELETE CASCADE not valid;

alter table "public"."events" validate constraint "events_series_id_fkey";

alter table "public"."events" add constraint "events_series_not_self" CHECK (((series_id IS NULL) OR (series_id <> id))) not valid;

alter table "public"."events" validate constraint "events_series_not_self";

alter table "public"."events" add constraint "events_series_occurrence_key_required" CHECK (((series_id IS NULL) OR (btrim(occurrence_key) <> ''::text))) not valid;

alter table "public"."events" validate constraint "events_series_occurrence_key_required";

alter table "public"."events" add constraint "events_source_identity_complete" CHECK ((((source_provider IS NULL) AND (integration_account_id IS NULL) AND (external_calendar_id IS NULL) AND (external_event_id IS NULL)) OR ((source_provider IS NOT NULL) AND (integration_account_id IS NOT NULL) AND (external_calendar_id IS NOT NULL) AND (external_event_id IS NOT NULL)))) not valid;

alter table "public"."events" validate constraint "events_source_identity_complete";

alter table "public"."events" add constraint "events_source_provider_non_empty" CHECK (((source_provider IS NULL) OR (btrim(source_provider) <> ''::text))) not valid;

alter table "public"."events" validate constraint "events_source_provider_non_empty";

alter table "public"."events" add constraint "events_time_window" CHECK (((ends_at IS NULL) OR (ends_at > starts_at))) not valid;

alter table "public"."events" validate constraint "events_time_window";

alter table "public"."events" add constraint "events_training_plan_id_fkey" FOREIGN KEY (training_plan_id) REFERENCES public.training_plans(id) ON DELETE SET NULL not valid;

alter table "public"."events" validate constraint "events_training_plan_id_fkey";

grant delete on table "public"."events" to "anon";

grant insert on table "public"."events" to "anon";

grant references on table "public"."events" to "anon";

grant select on table "public"."events" to "anon";

grant trigger on table "public"."events" to "anon";

grant truncate on table "public"."events" to "anon";

grant update on table "public"."events" to "anon";

grant delete on table "public"."events" to "authenticated";

grant insert on table "public"."events" to "authenticated";

grant references on table "public"."events" to "authenticated";

grant select on table "public"."events" to "authenticated";

grant trigger on table "public"."events" to "authenticated";

grant truncate on table "public"."events" to "authenticated";

grant update on table "public"."events" to "authenticated";

grant delete on table "public"."events" to "service_role";

grant insert on table "public"."events" to "service_role";

grant references on table "public"."events" to "service_role";

grant select on table "public"."events" to "service_role";

grant trigger on table "public"."events" to "service_role";

grant truncate on table "public"."events" to "service_role";

grant update on table "public"."events" to "service_role";

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

