drop index if exists "public"."idx_activity_plans_profile_id";

alter table "public"."activity_plans" add column "is_system_template" boolean not null default false;

alter table "public"."activity_plans" alter column "profile_id" drop not null;

CREATE INDEX idx_activity_plans_system_templates ON public.activity_plans USING btree (is_system_template) WHERE (is_system_template = true);

CREATE INDEX idx_activity_plans_profile_id ON public.activity_plans USING btree (profile_id) WHERE (profile_id IS NOT NULL);

alter table "public"."activity_plans" add constraint "activity_plans_system_template_check" CHECK ((((is_system_template = true) AND (profile_id IS NULL)) OR ((is_system_template = false) AND (profile_id IS NOT NULL)))) not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_system_template_check";


