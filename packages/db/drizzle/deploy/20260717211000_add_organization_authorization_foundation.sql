-- Organization-scoped authorization only. These grants authorize entry to the
-- coaching workspace; they do not authorize access to athlete-owned data.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_non_empty check (btrim(name) <> ''),
  constraint organizations_slug_non_empty check (btrim(slug) <> '')
);

create unique index organizations_slug_unique_idx on public.organizations(slug);
create index organizations_created_by_profile_id_idx
  on public.organizations(created_by_profile_id);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_organization_profile_unique
    unique (organization_id, profile_id),
  constraint organization_memberships_id_organization_unique unique (id, organization_id),
  constraint organization_memberships_status_check check (status in ('active', 'inactive'))
);

create index organization_memberships_profile_status_idx
  on public.organization_memberships(profile_id, status);

create table public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_roles_organization_key_unique unique (organization_id, key),
  constraint organization_roles_id_organization_unique unique (id, organization_id),
  constraint organization_roles_key_non_empty check (btrim(key) <> ''),
  constraint organization_roles_name_non_empty check (btrim(name) <> '')
);

create table public.organization_permissions (
  key text primary key,
  description text not null,
  created_at timestamptz not null default now(),
  constraint organization_permissions_key_check check (key in ('coaching.access')),
  constraint organization_permissions_description_non_empty check (btrim(description) <> '')
);

insert into public.organization_permissions (key, description)
values ('coaching.access', 'Access the organization coaching workspace')
on conflict (key) do nothing;

create table public.organization_role_permission_grants (
  role_id uuid not null references public.organization_roles(id) on delete cascade,
  permission_key text not null references public.organization_permissions(key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create table public.organization_membership_role_grants (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  role_id uuid not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (membership_id, role_id),
  constraint organization_membership_role_grants_membership_fkey
    foreign key (membership_id, organization_id)
    references public.organization_memberships(id, organization_id)
    on delete cascade,
  constraint organization_membership_role_grants_role_fkey
    foreign key (role_id, organization_id)
    references public.organization_roles(id, organization_id)
    on delete cascade,
  constraint organization_membership_role_grants_status_check
    check (status in ('active', 'inactive'))
);

create index organization_membership_role_grants_role_status_idx
  on public.organization_membership_role_grants(role_id, status);

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_roles enable row level security;
alter table public.organization_permissions enable row level security;
alter table public.organization_role_permission_grants enable row level security;
alter table public.organization_membership_role_grants enable row level security;

revoke all on table
  public.organizations,
  public.organization_memberships,
  public.organization_roles,
  public.organization_permissions,
  public.organization_role_permission_grants,
  public.organization_membership_role_grants
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.organizations,
  public.organization_memberships,
  public.organization_roles,
  public.organization_permissions,
  public.organization_role_permission_grants,
  public.organization_membership_role_grants
to service_role;
