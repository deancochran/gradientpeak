create table "users" (
  "id" uuid not null default gen_random_uuid(),
  "created_at" timestamp with time zone not null default now(),
  "username" text unique check (char_length(username) >= 3),
  "avatar_url" text,
  "full_name" text,
  "updated_at" timestamp with time zone default now(),
  constraint "users_pkey" primary key ("id"),
  constraint "users_auth_fk" foreign key ("id") references "auth"."users"("id") on delete cascade
);