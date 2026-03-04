alter table "public"."profiles" drop constraint "profiles_gender_check";

alter table "public"."profiles" alter column "gender" set data type text using "gender"::text;

alter table "public"."profiles" add constraint "profiles_gender_check" CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_gender_check";


