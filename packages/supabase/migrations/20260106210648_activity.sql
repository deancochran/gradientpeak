alter table "public"."activity_streams" alter column "compressed_timestamps" set data type text using "compressed_timestamps"::text;

alter table "public"."activity_streams" alter column "compressed_values" set data type text using "compressed_values"::text;


