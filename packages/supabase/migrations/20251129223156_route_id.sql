create sequence "public"."activity_routes_idx_seq";

create table "public"."activity_routes" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('activity_routes_idx_seq'::regclass),
    "profile_id" uuid not null,
    "name" text not null,
    "description" text,
    "activity_type" activity_type not null,
    "file_path" text not null,
    "total_distance" integer not null,
    "total_ascent" integer,
    "total_descent" integer,
    "polyline" text not null,
    "elevation_polyline" text,
    "source" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."activities" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."activity_plans" add column "notes" text;

alter table "public"."activity_plans" add column "route_id" uuid;

alter table "public"."activity_plans" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."integrations" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."planned_activities" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."profiles" add column "updated_at" timestamp with time zone not null default now();

alter sequence "public"."activity_routes_idx_seq" owned by "public"."activity_routes"."idx";

CREATE UNIQUE INDEX activity_routes_idx_key ON public.activity_routes USING btree (idx);

CREATE UNIQUE INDEX activity_routes_pkey ON public.activity_routes USING btree (id);

CREATE INDEX idx_activity_plans_route_id ON public.activity_plans USING btree (route_id) WHERE (route_id IS NOT NULL);

CREATE INDEX idx_planned_activities_plan_date ON public.planned_activities USING btree (activity_plan_id, scheduled_date);

CREATE INDEX idx_routes_activity_type ON public.activity_routes USING btree (activity_type);

CREATE INDEX idx_routes_created_at ON public.activity_routes USING btree (created_at DESC);

CREATE INDEX idx_routes_name ON public.activity_routes USING btree (name);

CREATE INDEX idx_routes_profile_id ON public.activity_routes USING btree (profile_id);

alter table "public"."activity_routes" add constraint "activity_routes_pkey" PRIMARY KEY using index "activity_routes_pkey";

alter table "public"."activity_plans" add constraint "activity_plans_route_id_fkey" FOREIGN KEY (route_id) REFERENCES activity_routes(id) ON DELETE SET NULL not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_route_id_fkey";

alter table "public"."activity_routes" add constraint "activity_routes_idx_key" UNIQUE using index "activity_routes_idx_key";

alter table "public"."activity_routes" add constraint "activity_routes_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."activity_routes" validate constraint "activity_routes_profile_id_fkey";

alter table "public"."activity_routes" add constraint "activity_routes_total_ascent_check" CHECK ((total_ascent >= 0)) not valid;

alter table "public"."activity_routes" validate constraint "activity_routes_total_ascent_check";

alter table "public"."activity_routes" add constraint "activity_routes_total_descent_check" CHECK ((total_descent >= 0)) not valid;

alter table "public"."activity_routes" validate constraint "activity_routes_total_descent_check";

alter table "public"."activity_routes" add constraint "activity_routes_total_distance_check" CHECK ((total_distance >= 0)) not valid;

alter table "public"."activity_routes" validate constraint "activity_routes_total_distance_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$
;

grant delete on table "public"."activity_routes" to "anon";

grant insert on table "public"."activity_routes" to "anon";

grant references on table "public"."activity_routes" to "anon";

grant select on table "public"."activity_routes" to "anon";

grant trigger on table "public"."activity_routes" to "anon";

grant truncate on table "public"."activity_routes" to "anon";

grant update on table "public"."activity_routes" to "anon";

grant delete on table "public"."activity_routes" to "authenticated";

grant insert on table "public"."activity_routes" to "authenticated";

grant references on table "public"."activity_routes" to "authenticated";

grant select on table "public"."activity_routes" to "authenticated";

grant trigger on table "public"."activity_routes" to "authenticated";

grant truncate on table "public"."activity_routes" to "authenticated";

grant update on table "public"."activity_routes" to "authenticated";

grant delete on table "public"."activity_routes" to "service_role";

grant insert on table "public"."activity_routes" to "service_role";

grant references on table "public"."activity_routes" to "service_role";

grant select on table "public"."activity_routes" to "service_role";

grant trigger on table "public"."activity_routes" to "service_role";

grant truncate on table "public"."activity_routes" to "service_role";

grant update on table "public"."activity_routes" to "service_role";

CREATE TRIGGER update_activities_updated_at BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activity_plans_updated_at BEFORE UPDATE ON public.activity_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activity_routes_updated_at BEFORE UPDATE ON public.activity_routes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_planned_activities_updated_at BEFORE UPDATE ON public.planned_activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_synced_planned_activities_updated_at BEFORE UPDATE ON public.synced_planned_activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_training_plans_updated_at BEFORE UPDATE ON public.training_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


