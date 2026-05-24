create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  created_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  avatar_url text,
  cover_url text,
  access_level text not null default 'public',
  join_policy text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint groups_access_level_check check (access_level in ('public', 'members_only')),
  constraint groups_join_policy_check check (
    join_policy in ('open', 'request_to_join', 'invite_only')
  ),
  constraint groups_name_non_empty check (btrim(name) <> ''),
  constraint groups_slug_non_empty check (btrim(slug) <> '')
);

create unique index if not exists groups_slug_unique_idx
  on public.groups (slug)
  where deleted_at is null;

create index if not exists groups_created_at_idx
  on public.groups (created_at desc)
  where deleted_at is null;

create table if not exists public.group_memberships (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, profile_id),
  constraint group_memberships_role_check check (role in ('owner', 'admin', 'member')),
  constraint group_memberships_status_check check (status in ('active', 'left', 'removed'))
);

create index if not exists group_memberships_profile_status_idx
  on public.group_memberships (profile_id, status);

create index if not exists group_memberships_group_status_idx
  on public.group_memberships (group_id, status);

create table if not exists public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  invited_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_invitations_status_check check (
    status in ('pending', 'accepted', 'declined', 'revoked', 'expired')
  )
);

create index if not exists group_invitations_invited_profile_status_idx
  on public.group_invitations (invited_profile_id, status);

create unique index if not exists group_invitations_pending_profile_unique_idx
  on public.group_invitations (group_id, invited_profile_id)
  where status = 'pending';

create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_join_requests_status_check check (
    status in ('pending', 'approved', 'declined', 'cancelled')
  )
);

create index if not exists group_join_requests_group_status_idx
  on public.group_join_requests (group_id, status);

create unique index if not exists group_join_requests_pending_unique_idx
  on public.group_join_requests (group_id, profile_id)
  where status = 'pending';
