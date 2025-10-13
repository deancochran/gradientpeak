create sequence "public"."oauth_states_idx_seq";

create table "public"."oauth_states" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('oauth_states_idx_seq'::regclass),
    "state" text not null,
    "profile_id" uuid not null,
    "provider" integration_provider not null,
    "mobile_redirect_uri" text not null,
    "created_at" timestamp with time zone not null default now(),
    "expires_at" timestamp with time zone not null
);


alter sequence "public"."oauth_states_idx_seq" owned by "public"."oauth_states"."idx";

CREATE INDEX idx_oauth_states_expires_at ON public.oauth_states USING btree (expires_at);

CREATE INDEX idx_oauth_states_profile_id ON public.oauth_states USING btree (profile_id);

CREATE UNIQUE INDEX oauth_states_idx_key ON public.oauth_states USING btree (idx);

CREATE UNIQUE INDEX oauth_states_pkey ON public.oauth_states USING btree (id);

alter table "public"."oauth_states" add constraint "oauth_states_pkey" PRIMARY KEY using index "oauth_states_pkey";

alter table "public"."oauth_states" add constraint "oauth_states_idx_key" UNIQUE using index "oauth_states_idx_key";

alter table "public"."oauth_states" add constraint "oauth_states_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."oauth_states" validate constraint "oauth_states_profile_id_fkey";

grant delete on table "public"."oauth_states" to "anon";

grant insert on table "public"."oauth_states" to "anon";

grant references on table "public"."oauth_states" to "anon";

grant select on table "public"."oauth_states" to "anon";

grant trigger on table "public"."oauth_states" to "anon";

grant truncate on table "public"."oauth_states" to "anon";

grant update on table "public"."oauth_states" to "anon";

grant delete on table "public"."oauth_states" to "authenticated";

grant insert on table "public"."oauth_states" to "authenticated";

grant references on table "public"."oauth_states" to "authenticated";

grant select on table "public"."oauth_states" to "authenticated";

grant trigger on table "public"."oauth_states" to "authenticated";

grant truncate on table "public"."oauth_states" to "authenticated";

grant update on table "public"."oauth_states" to "authenticated";

grant delete on table "public"."oauth_states" to "service_role";

grant insert on table "public"."oauth_states" to "service_role";

grant references on table "public"."oauth_states" to "service_role";

grant select on table "public"."oauth_states" to "service_role";

grant trigger on table "public"."oauth_states" to "service_role";

grant truncate on table "public"."oauth_states" to "service_role";

grant update on table "public"."oauth_states" to "service_role";


