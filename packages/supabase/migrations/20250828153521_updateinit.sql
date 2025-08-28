alter table "public"."profiles" drop constraint "profiles_auth_fk";

alter table "public"."profiles" alter column "id" drop default;

alter table "public"."profiles" enable row level security;

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(concat_ws(' ',
        new.raw_user_meta_data->>'first_name',
        new.raw_user_meta_data->>'last_name'
      ), ''),
      split_part(new.email, '@', 1) -- fallback to email username
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$function$
;

create policy "Service role can do everything"
on "public"."profiles"
as permissive
for all
to public
using ((current_setting('role'::text) = 'service_role'::text));


create policy "Users can insert their own profile"
on "public"."profiles"
as permissive
for insert
to public
with check ((auth.uid() = id));


create policy "Users can update their own profile"
on "public"."profiles"
as permissive
for update
to public
using ((auth.uid() = id));


create policy "Users can view their own profile"
on "public"."profiles"
as permissive
for select
to public
using ((auth.uid() = id));



