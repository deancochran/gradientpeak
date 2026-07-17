alter table public.profiles
  add column if not exists default_content_visibility text not null default 'private';

alter table public.profiles
  drop constraint if exists profiles_default_content_visibility_check;

alter table public.profiles
  add constraint profiles_default_content_visibility_check
  check (default_content_visibility in ('private', 'followers', 'public'));

alter table public.activity_plans
  add column if not exists content_visibility text;

alter table public.activity_plans
  drop constraint if exists activity_plans_template_visibility_check,
  drop constraint if exists activity_plans_content_visibility_check,
  drop constraint if exists activity_plans_system_templates_public_check;

update public.activity_plans
set content_visibility = case
  when is_system_template is true then 'public'
  when template_visibility = 'public' then 'followers'
  else 'private'
end
where content_visibility is null;

alter table public.activity_plans
  alter column content_visibility set default 'private',
  alter column content_visibility set not null,
  alter column template_visibility set default 'private';

update public.activity_plans
set template_visibility = content_visibility
where template_visibility <> content_visibility;

alter table public.activity_plans
  add constraint activity_plans_template_visibility_check
  check (template_visibility = any(array['private'::text, 'followers'::text, 'public'::text])),
  add constraint activity_plans_content_visibility_check
  check (content_visibility in ('private', 'followers', 'public')),
  add constraint activity_plans_system_templates_public_check
  check (is_system_template = false or (template_visibility = 'public' and content_visibility = 'public'));

create index if not exists idx_activity_plans_content_visibility
  on public.activity_plans(content_visibility);

alter table public.training_plans
  add column if not exists content_visibility text;

alter table public.training_plans
  drop constraint if exists training_plans_template_visibility_check,
  drop constraint if exists training_plans_content_visibility_check,
  drop constraint if exists training_plans_system_templates_public_check;

update public.training_plans
set content_visibility = case
  when is_system_template is true then 'public'
  when template_visibility = 'public' then 'followers'
  else 'private'
end
where content_visibility is null;

alter table public.training_plans
  alter column content_visibility set default 'private',
  alter column content_visibility set not null,
  alter column template_visibility set default 'private';

update public.training_plans
set template_visibility = content_visibility
where template_visibility <> content_visibility;

alter table public.training_plans
  add constraint training_plans_template_visibility_check
  check (template_visibility = any(array['private'::text, 'followers'::text, 'public'::text])),
  add constraint training_plans_content_visibility_check
  check (content_visibility in ('private', 'followers', 'public')),
  add constraint training_plans_system_templates_public_check
  check (is_system_template = false or (template_visibility = 'public' and content_visibility = 'public'));

create index if not exists idx_training_plans_content_visibility
  on public.training_plans(content_visibility);

alter table public.activities
  add column if not exists content_visibility text;

alter table public.activities
  drop constraint if exists activities_content_visibility_check;

update public.activities
set content_visibility = case
  when is_private is true then 'private'
  else 'followers'
end
where content_visibility is null;

alter table public.activities
  alter column content_visibility set default 'private',
  alter column content_visibility set not null;

alter table public.activities
  add constraint activities_content_visibility_check
  check (content_visibility in ('private', 'followers', 'public'));

create index if not exists idx_activities_content_visibility
  on public.activities(content_visibility);
