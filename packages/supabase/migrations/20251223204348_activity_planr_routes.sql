drop policy "Users can manage their own activities" on "public"."activities";

drop policy "Users can manage their own activity plans" on "public"."activity_plans";

drop policy "Users can manage their own routes" on "public"."activity_routes";

-- Policy removed: activity_streams table no longer exists

drop policy "Users can manage their own integrations" on "public"."integrations";

drop policy "Users can manage their own oauth states" on "public"."oauth_states";

drop policy "Users can manage their own planned activities" on "public"."planned_activities";

drop policy "Users can manage their own profile" on "public"."profiles";

drop policy "Users can manage their own synced planned activities" on "public"."synced_planned_activities";

drop policy "Users can manage their own training plans" on "public"."training_plans";

alter table "public"."activities" disable row level security;

alter table "public"."activity_plans" alter column "structure" drop not null;

alter table "public"."activity_plans" disable row level security;

alter table "public"."activity_routes" disable row level security;

-- Table removed: activity_streams table no longer exists

alter table "public"."integrations" disable row level security;

alter table "public"."oauth_states" disable row level security;

alter table "public"."planned_activities" disable row level security;

alter table "public"."profiles" disable row level security;

alter table "public"."synced_planned_activities" disable row level security;

alter table "public"."training_plans" disable row level security;

alter table "public"."activity_plans" add constraint "activity_plans_has_content" CHECK (((structure IS NOT NULL) OR (route_id IS NOT NULL))) not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_has_content";


