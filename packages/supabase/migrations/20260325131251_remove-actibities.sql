drop trigger if exists "set_coaching_invitations_timestamp" on "public"."coaching_invitations";

drop trigger if exists "comments_delete_trigger" on "public"."comments";

drop trigger if exists "comments_insert_trigger" on "public"."comments";

drop trigger if exists "update_comments_updated_at" on "public"."comments";

drop policy "Users can see their own coaching relationships" on "public"."coaches_athletes";

drop policy "Users can manage their own coaching invitations" on "public"."coaching_invitations";

drop policy "Users can access participant info for conversations they are in" on "public"."conversation_participants";

drop policy "Users can manage their own participation" on "public"."conversation_participants";

drop policy "Users can access conversations they are a part of" on "public"."conversations";

drop policy "Users can access messages in conversations they are a part of" on "public"."messages";

drop policy "Users can insert messages in conversations they are a part of" on "public"."messages";

drop policy "Users can soft-delete their own messages" on "public"."messages";

revoke delete on table "public"."audit_log" from "anon";

revoke insert on table "public"."audit_log" from "anon";

revoke references on table "public"."audit_log" from "anon";

revoke select on table "public"."audit_log" from "anon";

revoke trigger on table "public"."audit_log" from "anon";

revoke truncate on table "public"."audit_log" from "anon";

revoke update on table "public"."audit_log" from "anon";

revoke delete on table "public"."audit_log" from "authenticated";

revoke insert on table "public"."audit_log" from "authenticated";

revoke references on table "public"."audit_log" from "authenticated";

revoke select on table "public"."audit_log" from "authenticated";

revoke trigger on table "public"."audit_log" from "authenticated";

revoke truncate on table "public"."audit_log" from "authenticated";

revoke update on table "public"."audit_log" from "authenticated";

revoke delete on table "public"."audit_log" from "service_role";

revoke insert on table "public"."audit_log" from "service_role";

revoke references on table "public"."audit_log" from "service_role";

revoke select on table "public"."audit_log" from "service_role";

revoke trigger on table "public"."audit_log" from "service_role";

revoke truncate on table "public"."audit_log" from "service_role";

revoke update on table "public"."audit_log" from "service_role";

revoke delete on table "public"."coaches_athletes" from "anon";

revoke insert on table "public"."coaches_athletes" from "anon";

revoke references on table "public"."coaches_athletes" from "anon";

revoke select on table "public"."coaches_athletes" from "anon";

revoke trigger on table "public"."coaches_athletes" from "anon";

revoke truncate on table "public"."coaches_athletes" from "anon";

revoke update on table "public"."coaches_athletes" from "anon";

revoke delete on table "public"."coaches_athletes" from "authenticated";

revoke insert on table "public"."coaches_athletes" from "authenticated";

revoke references on table "public"."coaches_athletes" from "authenticated";

revoke select on table "public"."coaches_athletes" from "authenticated";

revoke trigger on table "public"."coaches_athletes" from "authenticated";

revoke truncate on table "public"."coaches_athletes" from "authenticated";

revoke update on table "public"."coaches_athletes" from "authenticated";

revoke delete on table "public"."coaches_athletes" from "service_role";

revoke insert on table "public"."coaches_athletes" from "service_role";

revoke references on table "public"."coaches_athletes" from "service_role";

revoke select on table "public"."coaches_athletes" from "service_role";

revoke trigger on table "public"."coaches_athletes" from "service_role";

revoke truncate on table "public"."coaches_athletes" from "service_role";

revoke update on table "public"."coaches_athletes" from "service_role";

revoke delete on table "public"."coaching_invitations" from "anon";

revoke insert on table "public"."coaching_invitations" from "anon";

revoke references on table "public"."coaching_invitations" from "anon";

revoke select on table "public"."coaching_invitations" from "anon";

revoke trigger on table "public"."coaching_invitations" from "anon";

revoke truncate on table "public"."coaching_invitations" from "anon";

revoke update on table "public"."coaching_invitations" from "anon";

revoke delete on table "public"."coaching_invitations" from "authenticated";

revoke insert on table "public"."coaching_invitations" from "authenticated";

revoke references on table "public"."coaching_invitations" from "authenticated";

revoke select on table "public"."coaching_invitations" from "authenticated";

revoke trigger on table "public"."coaching_invitations" from "authenticated";

revoke truncate on table "public"."coaching_invitations" from "authenticated";

revoke update on table "public"."coaching_invitations" from "authenticated";

revoke delete on table "public"."coaching_invitations" from "service_role";

revoke insert on table "public"."coaching_invitations" from "service_role";

revoke references on table "public"."coaching_invitations" from "service_role";

revoke select on table "public"."coaching_invitations" from "service_role";

revoke trigger on table "public"."coaching_invitations" from "service_role";

revoke truncate on table "public"."coaching_invitations" from "service_role";

revoke update on table "public"."coaching_invitations" from "service_role";

revoke delete on table "public"."conversation_participants" from "anon";

revoke insert on table "public"."conversation_participants" from "anon";

revoke references on table "public"."conversation_participants" from "anon";

revoke select on table "public"."conversation_participants" from "anon";

revoke trigger on table "public"."conversation_participants" from "anon";

revoke truncate on table "public"."conversation_participants" from "anon";

revoke update on table "public"."conversation_participants" from "anon";

revoke delete on table "public"."conversation_participants" from "authenticated";

revoke insert on table "public"."conversation_participants" from "authenticated";

revoke references on table "public"."conversation_participants" from "authenticated";

revoke select on table "public"."conversation_participants" from "authenticated";

revoke trigger on table "public"."conversation_participants" from "authenticated";

revoke truncate on table "public"."conversation_participants" from "authenticated";

revoke update on table "public"."conversation_participants" from "authenticated";

revoke delete on table "public"."conversation_participants" from "service_role";

revoke insert on table "public"."conversation_participants" from "service_role";

revoke references on table "public"."conversation_participants" from "service_role";

revoke select on table "public"."conversation_participants" from "service_role";

revoke trigger on table "public"."conversation_participants" from "service_role";

revoke truncate on table "public"."conversation_participants" from "service_role";

revoke update on table "public"."conversation_participants" from "service_role";

revoke delete on table "public"."conversations" from "anon";

revoke insert on table "public"."conversations" from "anon";

revoke references on table "public"."conversations" from "anon";

revoke select on table "public"."conversations" from "anon";

revoke trigger on table "public"."conversations" from "anon";

revoke truncate on table "public"."conversations" from "anon";

revoke update on table "public"."conversations" from "anon";

revoke delete on table "public"."conversations" from "authenticated";

revoke insert on table "public"."conversations" from "authenticated";

revoke references on table "public"."conversations" from "authenticated";

revoke select on table "public"."conversations" from "authenticated";

revoke trigger on table "public"."conversations" from "authenticated";

revoke truncate on table "public"."conversations" from "authenticated";

revoke update on table "public"."conversations" from "authenticated";

revoke delete on table "public"."conversations" from "service_role";

revoke insert on table "public"."conversations" from "service_role";

revoke references on table "public"."conversations" from "service_role";

revoke select on table "public"."conversations" from "service_role";

revoke trigger on table "public"."conversations" from "service_role";

revoke truncate on table "public"."conversations" from "service_role";

revoke update on table "public"."conversations" from "service_role";

revoke delete on table "public"."messages" from "anon";

revoke insert on table "public"."messages" from "anon";

revoke references on table "public"."messages" from "anon";

revoke select on table "public"."messages" from "anon";

revoke trigger on table "public"."messages" from "anon";

revoke truncate on table "public"."messages" from "anon";

revoke update on table "public"."messages" from "anon";

revoke delete on table "public"."messages" from "authenticated";

revoke insert on table "public"."messages" from "authenticated";

revoke references on table "public"."messages" from "authenticated";

revoke select on table "public"."messages" from "authenticated";

revoke trigger on table "public"."messages" from "authenticated";

revoke truncate on table "public"."messages" from "authenticated";

revoke update on table "public"."messages" from "authenticated";

revoke delete on table "public"."messages" from "service_role";

revoke insert on table "public"."messages" from "service_role";

revoke references on table "public"."messages" from "service_role";

revoke select on table "public"."messages" from "service_role";

revoke trigger on table "public"."messages" from "service_role";

revoke truncate on table "public"."messages" from "service_role";

revoke update on table "public"."messages" from "service_role";

alter table "public"."activities" drop constraint "activities_trimp_source_check";

alter table "public"."audit_log" drop constraint "audit_log_actor_id_fkey";

alter table "public"."audit_log" drop constraint "audit_log_target_user_id_fkey";

alter table "public"."coaches_athletes" drop constraint "coaches_athletes_athlete_id_fkey";

alter table "public"."coaches_athletes" drop constraint "coaches_athletes_athlete_id_key";

alter table "public"."coaches_athletes" drop constraint "coaches_athletes_coach_id_fkey";

alter table "public"."coaching_invitations" drop constraint "coaching_invitations_athlete_id_coach_id_key";

alter table "public"."coaching_invitations" drop constraint "coaching_invitations_athlete_id_fkey";

alter table "public"."coaching_invitations" drop constraint "coaching_invitations_coach_id_fkey";

alter table "public"."conversation_participants" drop constraint "conversation_participants_conversation_id_fkey";

alter table "public"."conversation_participants" drop constraint "conversation_participants_user_id_fkey";

alter table "public"."messages" drop constraint "messages_content_check";

alter table "public"."messages" drop constraint "messages_conversation_id_fkey";

alter table "public"."messages" drop constraint "messages_sender_id_fkey";

drop function if exists "public"."trigger_set_timestamp"();

drop function if exists "public"."update_comments_count"();

drop function if exists "public"."update_comments_updated_at_column"();

alter table "public"."audit_log" drop constraint "audit_log_pkey";

alter table "public"."coaches_athletes" drop constraint "coaches_athletes_pkey";

alter table "public"."coaching_invitations" drop constraint "coaching_invitations_pkey";

alter table "public"."conversation_participants" drop constraint "conversation_participants_pkey";

alter table "public"."conversations" drop constraint "conversations_pkey";

alter table "public"."messages" drop constraint "messages_pkey";

drop index if exists "public"."audit_log_pkey";

drop index if exists "public"."coaches_athletes_athlete_id_key";

drop index if exists "public"."coaches_athletes_pkey";

drop index if exists "public"."coaching_invitations_athlete_id_coach_id_key";

drop index if exists "public"."coaching_invitations_pkey";

drop index if exists "public"."conversation_participants_pkey";

drop index if exists "public"."conversations_pkey";

drop index if exists "public"."idx_activities_intensity_factor";

drop index if exists "public"."idx_activities_profile_tss";

drop index if exists "public"."idx_activities_trimp";

drop index if exists "public"."idx_activities_trimp_source";

drop index if exists "public"."idx_activities_tss";

drop index if exists "public"."idx_audit_log_actor_id";

drop index if exists "public"."idx_audit_log_target_user_id";

drop index if exists "public"."idx_coaching_invitations_athlete_id";

drop index if exists "public"."idx_coaching_invitations_coach_id";

drop index if exists "public"."idx_follows_following_id";

drop index if exists "public"."idx_messages_conversation_id";

drop index if exists "public"."idx_training_plans_is_active";

drop index if exists "public"."messages_pkey";

drop index if exists "public"."unique_active_training_plan_per_user";

drop table "public"."audit_log";

drop table "public"."coaches_athletes";

drop table "public"."coaching_invitations";

drop table "public"."conversation_participants";

drop table "public"."conversations";

drop table "public"."messages";


  create table "public"."user_training_plans" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "profile_id" uuid not null,
    "training_plan_id" uuid not null,
    "status" text not null default 'active'::text,
    "start_date" date not null,
    "target_date" date,
    "snapshot_structure" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."activities" drop column "comments_count";

alter table "public"."activities" drop column "hr_zone_1_seconds";

alter table "public"."activities" drop column "hr_zone_2_seconds";

alter table "public"."activities" drop column "hr_zone_3_seconds";

alter table "public"."activities" drop column "hr_zone_4_seconds";

alter table "public"."activities" drop column "hr_zone_5_seconds";

alter table "public"."activities" drop column "intensity_factor";

alter table "public"."activities" drop column "power_zone_1_seconds";

alter table "public"."activities" drop column "power_zone_2_seconds";

alter table "public"."activities" drop column "power_zone_3_seconds";

alter table "public"."activities" drop column "power_zone_4_seconds";

alter table "public"."activities" drop column "power_zone_5_seconds";

alter table "public"."activities" drop column "power_zone_6_seconds";

alter table "public"."activities" drop column "power_zone_7_seconds";

alter table "public"."activities" drop column "training_effect";

alter table "public"."activities" drop column "training_stress_score";

alter table "public"."activities" drop column "trimp";

alter table "public"."activities" drop column "trimp_source";

alter table "public"."activity_plans" drop column "comments_count";

alter table "public"."activity_routes" drop column "comments_count";

alter table "public"."events" add column "user_training_plan_id" uuid;

alter table "public"."follows" alter column "created_at" drop not null;

alter table "public"."follows" alter column "status" drop not null;

alter table "public"."follows" alter column "updated_at" drop not null;

alter table "public"."likes" alter column "created_at" drop not null;

alter table "public"."likes" alter column "entity_type" drop not null;

alter table "public"."likes" alter column "profile_id" drop not null;

alter table "public"."profiles" alter column "is_public" drop not null;

alter table "public"."training_plans" drop column "comments_count";

alter table "public"."training_plans" drop column "is_active";

drop type "public"."coaching_invitation_status";

drop type "public"."notification_type";

CREATE INDEX idx_events_user_training_plan ON public.events USING btree (user_training_plan_id) WHERE (user_training_plan_id IS NOT NULL);

CREATE INDEX idx_user_training_plans_profile_id ON public.user_training_plans USING btree (profile_id);

CREATE INDEX idx_user_training_plans_status ON public.user_training_plans USING btree (profile_id) WHERE (status = 'active'::text);

CREATE INDEX idx_user_training_plans_training_plan_id ON public.user_training_plans USING btree (training_plan_id);

CREATE UNIQUE INDEX user_training_plans_pkey ON public.user_training_plans USING btree (id);

alter table "public"."user_training_plans" add constraint "user_training_plans_pkey" PRIMARY KEY using index "user_training_plans_pkey";

alter table "public"."events" add constraint "events_user_training_plan_id_fkey" FOREIGN KEY (user_training_plan_id) REFERENCES public.user_training_plans(id) ON DELETE SET NULL not valid;

alter table "public"."events" validate constraint "events_user_training_plan_id_fkey";

alter table "public"."user_training_plans" add constraint "user_training_plans_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_training_plans" validate constraint "user_training_plans_profile_id_fkey";

alter table "public"."user_training_plans" add constraint "user_training_plans_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'abandoned'::text]))) not valid;

alter table "public"."user_training_plans" validate constraint "user_training_plans_status_check";

alter table "public"."user_training_plans" add constraint "user_training_plans_training_plan_id_fkey" FOREIGN KEY (training_plan_id) REFERENCES public.training_plans(id) ON DELETE CASCADE not valid;

alter table "public"."user_training_plans" validate constraint "user_training_plans_training_plan_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_likes_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    if tg_op = 'INSERT' then
        if new.entity_type = 'activity' then
            update public.activities set likes_count = likes_count + 1 where id = new.entity_id;
        elsif new.entity_type = 'training_plan' then
            update public.training_plans set likes_count = likes_count + 1 where id = new.entity_id;
        elsif new.entity_type = 'activity_plan' then
            update public.activity_plans set likes_count = likes_count + 1 where id = new.entity_id;
        elsif new.entity_type = 'route' then
            update public.activity_routes set likes_count = likes_count + 1 where id = new.entity_id;
        end if;
        return new;
    elsif tg_op = 'DELETE' then
        if old.entity_type = 'activity' then
            update public.activities set likes_count = likes_count - 1 where id = old.entity_id;
        elsif old.entity_type = 'training_plan' then
            update public.training_plans set likes_count = likes_count - 1 where id = old.entity_id;
        elsif old.entity_type = 'activity_plan' then
            update public.activity_plans set likes_count = likes_count - 1 where id = old.entity_id;
        elsif old.entity_type = 'route' then
            update public.activity_routes set likes_count = likes_count - 1 where id = old.entity_id;
        end if;
        return old;
    end if;
    return null;
end;
$function$
;

grant delete on table "public"."user_training_plans" to "anon";

grant insert on table "public"."user_training_plans" to "anon";

grant references on table "public"."user_training_plans" to "anon";

grant select on table "public"."user_training_plans" to "anon";

grant trigger on table "public"."user_training_plans" to "anon";

grant truncate on table "public"."user_training_plans" to "anon";

grant update on table "public"."user_training_plans" to "anon";

grant delete on table "public"."user_training_plans" to "authenticated";

grant insert on table "public"."user_training_plans" to "authenticated";

grant references on table "public"."user_training_plans" to "authenticated";

grant select on table "public"."user_training_plans" to "authenticated";

grant trigger on table "public"."user_training_plans" to "authenticated";

grant truncate on table "public"."user_training_plans" to "authenticated";

grant update on table "public"."user_training_plans" to "authenticated";

grant delete on table "public"."user_training_plans" to "service_role";

grant insert on table "public"."user_training_plans" to "service_role";

grant references on table "public"."user_training_plans" to "service_role";

grant select on table "public"."user_training_plans" to "service_role";

grant trigger on table "public"."user_training_plans" to "service_role";

grant truncate on table "public"."user_training_plans" to "service_role";

grant update on table "public"."user_training_plans" to "service_role";

CREATE TRIGGER update_user_training_plans_updated_at BEFORE UPDATE ON public.user_training_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


