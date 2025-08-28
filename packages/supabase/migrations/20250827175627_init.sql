create type "public"."sync_status" as enum ('local_only', 'syncing', 'synced', 'sync_failed');

create table "public"."activities" (
    "id" uuid not null default gen_random_uuid(),
    "profile_id" uuid not null,
    "local_fit_file_path" text not null,
    "sync_status" sync_status not null default 'local_only'::sync_status,
    "cloud_storage_path" text,
    "sync_error_message" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


create table "public"."profiles" (
    "id" uuid not null default gen_random_uuid(),
    "avatar_url" text,
    "full_name" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone default now()
);


CREATE UNIQUE INDEX activities_pkey ON public.activities USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

alter table "public"."activities" add constraint "activities_pkey" PRIMARY KEY using index "activities_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."activities" add constraint "activities_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."activities" validate constraint "activities_profile_id_fkey";

alter table "public"."profiles" add constraint "profiles_auth_fk" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_auth_fk";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    concat_ws(' ',
      new.raw_user_meta_data->>'first_name',
      new.raw_user_meta_data->>'last_name'
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$function$
;

grant delete on table "public"."activities" to "anon";

grant insert on table "public"."activities" to "anon";

grant references on table "public"."activities" to "anon";

grant select on table "public"."activities" to "anon";

grant trigger on table "public"."activities" to "anon";

grant truncate on table "public"."activities" to "anon";

grant update on table "public"."activities" to "anon";

grant delete on table "public"."activities" to "authenticated";

grant insert on table "public"."activities" to "authenticated";

grant references on table "public"."activities" to "authenticated";

grant select on table "public"."activities" to "authenticated";

grant trigger on table "public"."activities" to "authenticated";

grant truncate on table "public"."activities" to "authenticated";

grant update on table "public"."activities" to "authenticated";

grant delete on table "public"."activities" to "service_role";

grant insert on table "public"."activities" to "service_role";

grant references on table "public"."activities" to "service_role";

grant select on table "public"."activities" to "service_role";

grant trigger on table "public"."activities" to "service_role";

grant truncate on table "public"."activities" to "service_role";

grant update on table "public"."activities" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";


