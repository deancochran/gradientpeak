alter table "public"."activity_efforts" drop constraint "activity_efforts_activity_id_fkey";

alter table "public"."activity_efforts" add constraint "activity_efforts_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE SET NULL not valid;

alter table "public"."activity_efforts" validate constraint "activity_efforts_activity_id_fkey";


