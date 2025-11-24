drop index if exists "public"."idx_synced_planned_activities_provider";

alter table "public"."integrations" add column "external_id" text not null;

alter table "public"."synced_planned_activities" drop column "external_workout_id";

alter table "public"."synced_planned_activities" add column "external_id" text not null;

CREATE INDEX idx_integrations_external_id ON public.integrations USING btree (external_id);

CREATE INDEX idx_synced_planned_activities_provider ON public.synced_planned_activities USING btree (provider, external_id);


