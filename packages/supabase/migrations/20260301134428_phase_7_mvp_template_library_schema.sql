  create table "public"."library_items" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "profile_id" uuid not null,
    "item_type" text not null,
    "item_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."activity_plans" add column "import_external_id" text;

alter table "public"."activity_plans" add column "import_provider" text;

alter table "public"."activity_plans" add column "template_visibility" text not null default 'private'::text;

alter table "public"."events" add column "schedule_batch_id" uuid;

alter table "public"."training_plans" add column "template_visibility" text not null default 'private'::text;

CREATE UNIQUE INDEX idx_activity_plans_import_identity ON public.activity_plans USING btree (profile_id, import_provider, import_external_id) WHERE ((import_provider IS NOT NULL) AND (import_external_id IS NOT NULL));

CREATE INDEX idx_activity_plans_visibility ON public.activity_plans USING btree (template_visibility);

CREATE INDEX idx_events_schedule_batch ON public.events USING btree (profile_id, schedule_batch_id) WHERE (schedule_batch_id IS NOT NULL);

CREATE INDEX idx_library_items_item_lookup ON public.library_items USING btree (item_type, item_id);

CREATE INDEX idx_library_items_profile_type_created ON public.library_items USING btree (profile_id, item_type, created_at DESC);

CREATE INDEX idx_training_plans_visibility ON public.training_plans USING btree (template_visibility);

CREATE UNIQUE INDEX library_items_pkey ON public.library_items USING btree (id);

CREATE UNIQUE INDEX library_items_profile_id_item_type_item_id_key ON public.library_items USING btree (profile_id, item_type, item_id);

alter table "public"."library_items" add constraint "library_items_pkey" PRIMARY KEY using index "library_items_pkey";

alter table "public"."activity_plans" add constraint "activity_plans_import_external_id_non_empty_check" CHECK (((import_external_id IS NULL) OR (btrim(import_external_id) <> ''::text))) not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_import_external_id_non_empty_check";

alter table "public"."activity_plans" add constraint "activity_plans_import_provider_non_empty_check" CHECK (((import_provider IS NULL) OR (btrim(import_provider) <> ''::text))) not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_import_provider_non_empty_check";

alter table "public"."activity_plans" add constraint "activity_plans_system_templates_public_check" CHECK (((is_system_template = false) OR (template_visibility = 'public'::text))) not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_system_templates_public_check";

alter table "public"."activity_plans" add constraint "activity_plans_template_visibility_check" CHECK ((template_visibility = ANY (ARRAY['private'::text, 'public'::text]))) not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_template_visibility_check";

alter table "public"."library_items" add constraint "library_items_item_type_check" CHECK ((item_type = ANY (ARRAY['training_plan'::text, 'activity_plan'::text]))) not valid;

alter table "public"."library_items" validate constraint "library_items_item_type_check";

alter table "public"."library_items" add constraint "library_items_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."library_items" validate constraint "library_items_profile_id_fkey";

alter table "public"."library_items" add constraint "library_items_profile_id_item_type_item_id_key" UNIQUE using index "library_items_profile_id_item_type_item_id_key";

alter table "public"."training_plans" add constraint "training_plans_system_templates_public_check" CHECK (((is_system_template = false) OR (template_visibility = 'public'::text))) not valid;

alter table "public"."training_plans" validate constraint "training_plans_system_templates_public_check";

alter table "public"."training_plans" add constraint "training_plans_template_visibility_check" CHECK ((template_visibility = ANY (ARRAY['private'::text, 'public'::text]))) not valid;

alter table "public"."training_plans" validate constraint "training_plans_template_visibility_check";

grant delete on table "public"."library_items" to "anon";

grant insert on table "public"."library_items" to "anon";

grant references on table "public"."library_items" to "anon";

grant select on table "public"."library_items" to "anon";

grant trigger on table "public"."library_items" to "anon";

grant truncate on table "public"."library_items" to "anon";

grant update on table "public"."library_items" to "anon";

grant delete on table "public"."library_items" to "authenticated";

grant insert on table "public"."library_items" to "authenticated";

grant references on table "public"."library_items" to "authenticated";

grant select on table "public"."library_items" to "authenticated";

grant trigger on table "public"."library_items" to "authenticated";

grant truncate on table "public"."library_items" to "authenticated";

grant update on table "public"."library_items" to "authenticated";

grant delete on table "public"."library_items" to "service_role";

grant insert on table "public"."library_items" to "service_role";

grant references on table "public"."library_items" to "service_role";

grant select on table "public"."library_items" to "service_role";

grant trigger on table "public"."library_items" to "service_role";

grant truncate on table "public"."library_items" to "service_role";

grant update on table "public"."library_items" to "service_role";

