set local check_function_bodies = off;

alter type "public"."planned_session_source_kind" RENAME to "planned_session_source_kind__pgdelta_replaced";

create type "public"."planned_session_source_kind" as enum (
  'direct',
  'training_plan'
);

alter table "public"."planned_sessions"
  alter column "source_kind" type "public"."planned_session_source_kind" using "source_kind"::text::"public"."planned_session_source_kind";

drop type "public"."planned_session_source_kind__pgdelta_replaced";

alter type "public"."threshold_metric" add value 'lthr' after 'speed';

