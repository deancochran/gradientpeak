alter table "public"."activity_plans" drop constraint "activity_plans_estimated_duration_check";

alter table "public"."activity_plans" drop constraint "activity_plans_estimated_tss_check";

alter table "public"."activity_plans" drop column "estimated_duration";

alter table "public"."activity_plans" drop column "estimated_tss";


