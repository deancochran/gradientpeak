create type "public"."gender" as enum ('male', 'female', 'other');

alter table "public"."profiles" add column "gender" public.gender;


