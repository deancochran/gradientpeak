-- Keep profile avatars publicly addressable by URL while preventing broad
-- unauthenticated Storage object listing through the public bucket policy.
drop policy if exists "Anyone can view avatars" on storage.objects;

-- SECURITY DEFINER trigger functions do not need to be directly executable by
-- application API roles. Revoke explicit and inherited execute grants so the
-- auth.users trigger remains the only intended invocation path.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
