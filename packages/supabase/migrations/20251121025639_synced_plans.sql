create sequence "public"."synced_planned_activities_idx_seq";

alter table "public"."planned_activities" drop constraint "chk_planned_activities_date";

alter table "public"."training_plans" drop constraint "unique_training_plan_per_user";

alter table "public"."activities" drop constraint "activities_intensity_factor_check";

drop index if exists "public"."unique_training_plan_per_user";

create table "public"."synced_planned_activities" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('synced_planned_activities_idx_seq'::regclass),
    "profile_id" uuid not null,
    "planned_activity_id" uuid not null,
    "provider" integration_provider not null,
    "external_workout_id" text not null,
    "synced_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."activities" add column "external_id" text;

alter table "public"."activities" add column "provider" integration_provider;

alter table "public"."activities" alter column "distance" set default 0;

alter table "public"."activities" alter column "total_ascent" set default 0;

alter table "public"."activities" alter column "total_descent" set default 0;

alter table "public"."activity_plans" alter column "description" set not null;

alter sequence "public"."synced_planned_activities_idx_seq" owned by "public"."synced_planned_activities"."idx";

CREATE UNIQUE INDEX idx_activities_external_unique ON public.activities USING btree (provider, external_id) WHERE ((external_id IS NOT NULL) AND (provider IS NOT NULL));

CREATE INDEX idx_activities_provider_external ON public.activities USING btree (provider, external_id) WHERE (external_id IS NOT NULL);

CREATE INDEX idx_integrations_profile_id ON public.integrations USING btree (profile_id);

CREATE INDEX idx_planned_activities_scheduled_date ON public.planned_activities USING btree (scheduled_date);

CREATE INDEX idx_synced_planned_activities_planned ON public.synced_planned_activities USING btree (planned_activity_id);

CREATE INDEX idx_synced_planned_activities_profile ON public.synced_planned_activities USING btree (profile_id);

CREATE INDEX idx_synced_planned_activities_provider ON public.synced_planned_activities USING btree (provider, external_workout_id);

CREATE INDEX idx_training_plans_is_active ON public.training_plans USING btree (is_active) WHERE (is_active = true);

CREATE UNIQUE INDEX synced_planned_activities_idx_key ON public.synced_planned_activities USING btree (idx);

CREATE UNIQUE INDEX synced_planned_activities_pkey ON public.synced_planned_activities USING btree (id);

CREATE UNIQUE INDEX unique_planned_activity_per_provider ON public.synced_planned_activities USING btree (planned_activity_id, provider);

alter table "public"."synced_planned_activities" add constraint "synced_planned_activities_pkey" PRIMARY KEY using index "synced_planned_activities_pkey";

alter table "public"."synced_planned_activities" add constraint "synced_planned_activities_idx_key" UNIQUE using index "synced_planned_activities_idx_key";

alter table "public"."synced_planned_activities" add constraint "synced_planned_activities_planned_activity_id_fkey" FOREIGN KEY (planned_activity_id) REFERENCES planned_activities(id) ON DELETE CASCADE not valid;

alter table "public"."synced_planned_activities" validate constraint "synced_planned_activities_planned_activity_id_fkey";

alter table "public"."synced_planned_activities" add constraint "synced_planned_activities_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."synced_planned_activities" validate constraint "synced_planned_activities_profile_id_fkey";

alter table "public"."synced_planned_activities" add constraint "unique_planned_activity_per_provider" UNIQUE using index "unique_planned_activity_per_provider";

alter table "public"."activities" add constraint "activities_intensity_factor_check" CHECK (((intensity_factor >= 0) AND (intensity_factor <= 200))) not valid;

alter table "public"."activities" validate constraint "activities_intensity_factor_check";

grant delete on table "public"."synced_planned_activities" to "anon";

grant insert on table "public"."synced_planned_activities" to "anon";

grant references on table "public"."synced_planned_activities" to "anon";

grant select on table "public"."synced_planned_activities" to "anon";

grant trigger on table "public"."synced_planned_activities" to "anon";

grant truncate on table "public"."synced_planned_activities" to "anon";

grant update on table "public"."synced_planned_activities" to "anon";

grant delete on table "public"."synced_planned_activities" to "authenticated";

grant insert on table "public"."synced_planned_activities" to "authenticated";

grant references on table "public"."synced_planned_activities" to "authenticated";

grant select on table "public"."synced_planned_activities" to "authenticated";

grant trigger on table "public"."synced_planned_activities" to "authenticated";

grant truncate on table "public"."synced_planned_activities" to "authenticated";

grant update on table "public"."synced_planned_activities" to "authenticated";

grant delete on table "public"."synced_planned_activities" to "service_role";

grant insert on table "public"."synced_planned_activities" to "service_role";

grant references on table "public"."synced_planned_activities" to "service_role";

grant select on table "public"."synced_planned_activities" to "service_role";

grant trigger on table "public"."synced_planned_activities" to "service_role";

grant truncate on table "public"."synced_planned_activities" to "service_role";

grant update on table "public"."synced_planned_activities" to "service_role";


