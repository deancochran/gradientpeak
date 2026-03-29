alter table "public"."activities"
add column "import_file_type" text,
add column "import_original_file_name" text,
add column "import_source" text;

alter table "public"."activities"
add constraint "activities_import_file_type_non_empty_check"
check ("import_file_type" is null or btrim("import_file_type") <> '');

alter table "public"."activities"
add constraint "activities_import_original_file_name_non_empty_check"
check (
  "import_original_file_name" is null or btrim("import_original_file_name") <> ''
);

alter table "public"."activities"
add constraint "activities_import_source_check"
check (
  "import_source" is null
  or "import_source" = 'manual_historical'
);
