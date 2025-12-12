alter table "public"."activities" enable row level security;

alter table "public"."activity_plans" enable row level security;

alter table "public"."activity_routes" enable row level security;

alter table "public"."activity_streams" enable row level security;

alter table "public"."integrations" enable row level security;

alter table "public"."oauth_states" enable row level security;

alter table "public"."planned_activities" enable row level security;

alter table "public"."profiles" enable row level security;

alter table "public"."synced_planned_activities" enable row level security;

alter table "public"."training_plans" enable row level security;


  create policy "Users can manage their own activities"
  on "public"."activities"
  as permissive
  for all
  to public
using ((auth.uid() = profile_id))
with check ((auth.uid() = profile_id));



  create policy "Users can manage their own activity plans"
  on "public"."activity_plans"
  as permissive
  for all
  to public
using ((auth.uid() = profile_id))
with check ((auth.uid() = profile_id));



  create policy "Users can manage their own routes"
  on "public"."activity_routes"
  as permissive
  for all
  to public
using ((auth.uid() = profile_id))
with check ((auth.uid() = profile_id));



  create policy "Users can manage their own activity streams"
  on "public"."activity_streams"
  as permissive
  for all
  to public
using ((auth.uid() = ( SELECT activities.profile_id
   FROM public.activities
  WHERE (activities.id = activity_streams.activity_id))))
with check ((auth.uid() = ( SELECT activities.profile_id
   FROM public.activities
  WHERE (activities.id = activity_streams.activity_id))));



  create policy "Users can manage their own integrations"
  on "public"."integrations"
  as permissive
  for all
  to public
using ((auth.uid() = profile_id))
with check ((auth.uid() = profile_id));



  create policy "Users can manage their own oauth states"
  on "public"."oauth_states"
  as permissive
  for all
  to public
using ((auth.uid() = profile_id))
with check ((auth.uid() = profile_id));



  create policy "Users can manage their own planned activities"
  on "public"."planned_activities"
  as permissive
  for all
  to public
using ((auth.uid() = profile_id))
with check ((auth.uid() = profile_id));



  create policy "Users can manage their own profile"
  on "public"."profiles"
  as permissive
  for all
  to public
using ((auth.uid() = id))
with check ((auth.uid() = id));



  create policy "Users can manage their own synced planned activities"
  on "public"."synced_planned_activities"
  as permissive
  for all
  to public
using ((auth.uid() = profile_id))
with check ((auth.uid() = profile_id));



  create policy "Users can manage their own training plans"
  on "public"."training_plans"
  as permissive
  for all
  to public
using ((auth.uid() = profile_id))
with check ((auth.uid() = profile_id));



