create type "public"."integration_provider" as enum ('strava', 'wahoo', 'trainingpeaks', 'garmin', 'zwift');

create sequence "public"."integrations_idx_seq";

create table "public"."integrations" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('integrations_idx_seq'::regclass),
    "profile_id" uuid not null,
    "provider" integration_provider not null,
    "access_token" text not null,
    "refresh_token" text,
    "expires_at" timestamp with time zone,
    "scope" text,
    "created_at" timestamp with time zone not null default now()
);


alter sequence "public"."integrations_idx_seq" owned by "public"."integrations"."idx";

CREATE INDEX idx_integrations_expires_at ON public.integrations USING btree (expires_at);

CREATE INDEX idx_integrations_provider ON public.integrations USING btree (provider);

CREATE UNIQUE INDEX unique_integration_type ON public.integrations USING btree (profile_id, provider);

CREATE UNIQUE INDEX integrations_idx_key ON public.integrations USING btree (idx);

CREATE UNIQUE INDEX integrations_pkey ON public.integrations USING btree (id);

alter table "public"."integrations" add constraint "integrations_pkey" PRIMARY KEY using index "integrations_pkey";

alter table "public"."integrations" add constraint "unique_integration_type" UNIQUE using index "unique_integration_type";

alter table "public"."integrations" add constraint "integrations_idx_key" UNIQUE using index "integrations_idx_key";

alter table "public"."integrations" add constraint "integrations_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."integrations" validate constraint "integrations_profile_id_fkey";

grant delete on table "public"."integrations" to "anon";

grant insert on table "public"."integrations" to "anon";

grant references on table "public"."integrations" to "anon";

grant select on table "public"."integrations" to "anon";

grant trigger on table "public"."integrations" to "anon";

grant truncate on table "public"."integrations" to "anon";

grant update on table "public"."integrations" to "anon";

grant delete on table "public"."integrations" to "authenticated";

grant insert on table "public"."integrations" to "authenticated";

grant references on table "public"."integrations" to "authenticated";

grant select on table "public"."integrations" to "authenticated";

grant trigger on table "public"."integrations" to "authenticated";

grant truncate on table "public"."integrations" to "authenticated";

grant update on table "public"."integrations" to "authenticated";

grant delete on table "public"."integrations" to "service_role";

grant insert on table "public"."integrations" to "service_role";

grant references on table "public"."integrations" to "service_role";

grant select on table "public"."integrations" to "service_role";

grant trigger on table "public"."integrations" to "service_role";

grant truncate on table "public"."integrations" to "service_role";

grant update on table "public"."integrations" to "service_role";
