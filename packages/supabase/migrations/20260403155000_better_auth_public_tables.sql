set check_function_bodies = off;

create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists public.sessions (
  id text primary key,
  expires_at timestamp not null,
  token text not null unique,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  ip_address text,
  user_agent text,
  user_id text not null references public.users(id) on delete cascade
);

create index if not exists sessions_userId_idx on public.sessions(user_id);

create table if not exists public.accounts (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references public.users(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamp,
  refresh_token_expires_at timestamp,
  scope text,
  password text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists accounts_userId_idx on public.accounts(user_id);

create table if not exists public.verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamp not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists verifications_identifier_idx on public.verifications(identifier);

insert into public.users (id, name, email, email_verified, image, created_at, updated_at)
select
  u.id::text,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    split_part(u.email, '@', 1)
  ) as name,
  u.email,
  (u.email_confirmed_at is not null) as email_verified,
  coalesce(nullif(u.raw_user_meta_data ->> 'avatar_url', ''), nullif(u.raw_user_meta_data ->> 'picture', '')) as image,
  coalesce(u.created_at, now()) as created_at,
  coalesce(u.updated_at, u.created_at, now()) as updated_at
from auth.users u
where u.email is not null
  and u.deleted_at is null
  and not exists (
    select 1 from public.users existing where existing.id = u.id::text
  );

insert into public.accounts (
  id,
  account_id,
  provider_id,
  user_id,
  password,
  created_at,
  updated_at
)
select
  'credential:' || u.id::text as id,
  u.id::text as account_id,
  'credential' as provider_id,
  u.id::text as user_id,
  u.encrypted_password as password,
  coalesce(u.created_at, now()) as created_at,
  coalesce(u.updated_at, u.created_at, now()) as updated_at
from auth.users u
where u.email is not null
  and u.deleted_at is null
  and u.encrypted_password is not null
  and u.encrypted_password <> ''
  and not exists (
    select 1
    from public.accounts existing
    where existing.provider_id = 'credential'
      and existing.account_id = u.id::text
  );
