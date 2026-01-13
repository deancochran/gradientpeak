alter table "public"."planned_activities" add column "training_plan_id" uuid;

CREATE INDEX idx_planned_activities_training_plan_date ON public.planned_activities USING btree (training_plan_id, scheduled_date);

CREATE INDEX idx_planned_activities_training_plan_id ON public.planned_activities USING btree (training_plan_id);

alter table "public"."planned_activities" add constraint "planned_activities_training_plan_id_fkey" FOREIGN KEY (training_plan_id) REFERENCES public.training_plans(id) ON DELETE CASCADE not valid;

alter table "public"."planned_activities" validate constraint "planned_activities_training_plan_id_fkey";


