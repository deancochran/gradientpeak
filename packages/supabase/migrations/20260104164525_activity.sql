alter table "public"."planned_activities" drop constraint "planned_activities_activity_plan_id_fkey";

alter table "public"."planned_activities" alter column "activity_plan_id" drop not null;

alter table "public"."planned_activities" add constraint "planned_activities_activity_plan_id_fkey" FOREIGN KEY (activity_plan_id) REFERENCES public.activity_plans(id) ON DELETE SET NULL not valid;

alter table "public"."planned_activities" validate constraint "planned_activities_activity_plan_id_fkey";


