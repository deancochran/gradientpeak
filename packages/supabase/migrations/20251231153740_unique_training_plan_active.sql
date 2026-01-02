alter table "public"."activities" drop constraint "activities_planned_activity_id_fkey";

drop index if exists "public"."idx_activities_planned";

drop index if exists "public"."idx_training_plans_is_active";

alter table "public"."activities" drop column "planned_activity_id";

alter table "public"."activities" add column "activity_plan_id" uuid;

alter table "public"."training_plans" add column "is_system_template" boolean not null default false;

alter table "public"."training_plans" alter column "profile_id" drop not null;

CREATE INDEX idx_activities_activity_plan ON public.activities USING btree (activity_plan_id) WHERE (activity_plan_id IS NOT NULL);

CREATE INDEX idx_training_plans_is_system_template ON public.training_plans USING btree (is_system_template) WHERE (is_system_template = true);

CREATE INDEX idx_training_plans_name ON public.training_plans USING btree (name);

CREATE UNIQUE INDEX unique_active_training_plan_per_user ON public.training_plans USING btree (profile_id) WHERE (is_active = true);

CREATE INDEX idx_training_plans_is_active ON public.training_plans USING btree (profile_id) WHERE (is_active = true);

alter table "public"."activities" add constraint "activities_activity_plan_id_fkey" FOREIGN KEY (activity_plan_id) REFERENCES public.activity_plans(id) ON DELETE SET NULL not valid;

alter table "public"."activities" validate constraint "activities_activity_plan_id_fkey";

alter table "public"."training_plans" add constraint "training_plans_template_profile_check" CHECK ((((is_system_template = true) AND (profile_id IS NULL)) OR ((is_system_template = false) AND (profile_id IS NOT NULL)))) not valid;

alter table "public"."training_plans" validate constraint "training_plans_template_profile_check";


