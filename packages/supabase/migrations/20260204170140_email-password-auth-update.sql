set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.delete_own_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Delete the user from auth.users
  -- Postgres ON DELETE CASCADE constraints on related tables (profiles, activities, etc.)
  -- will automatically remove all associated user data.
  delete from auth.users where id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_status()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Check if there is a pending email change
  if exists (
    select 1
    from auth.users
    where id = auth.uid()
    and email_change is not null
  ) then
    return 'unverified';
  else
    return 'verified';
  end if;
end;
$function$
;


