-- ============================================================================
-- SOCIAL CORE TABLES: FOLLOWS + LIKES
--
-- Some environments were created from incremental migrations that did not
-- include these social tables, while newer init snapshots do include them.
-- This migration backfills the missing schema safely.
-- ============================================================================

create table if not exists public.follows (
    follower_id uuid not null references public.profiles(id) on delete cascade,
    following_id uuid not null references public.profiles(id) on delete cascade,
    status text not null check (status in ('pending', 'accepted')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (follower_id, following_id)
);

create index if not exists idx_follows_following_id
    on public.follows(following_id);

drop trigger if exists update_follows_updated_at on public.follows;
create trigger update_follows_updated_at
    before update on public.follows
    for each row
    execute function update_updated_at_column();

create table if not exists public.likes (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    entity_type text not null check (entity_type in ('activity', 'training_plan', 'activity_plan', 'route')),
    entity_id uuid not null,
    created_at timestamptz not null default now(),
    unique (profile_id, entity_type, entity_id)
);

create index if not exists idx_likes_entity
    on public.likes(entity_type, entity_id);

alter table public.activities add column if not exists likes_count integer default 0;
alter table public.training_plans add column if not exists likes_count integer default 0;
alter table public.activity_plans add column if not exists likes_count integer default 0;
alter table public.activity_routes add column if not exists likes_count integer default 0;

create or replace function public.update_likes_count()
returns trigger as $$
begin
    if tg_op = 'INSERT' then
        if new.entity_type = 'activity' then
            update public.activities
            set likes_count = coalesce(likes_count, 0) + 1
            where id = new.entity_id;
        elsif new.entity_type = 'training_plan' then
            update public.training_plans
            set likes_count = coalesce(likes_count, 0) + 1
            where id = new.entity_id;
        elsif new.entity_type = 'activity_plan' then
            update public.activity_plans
            set likes_count = coalesce(likes_count, 0) + 1
            where id = new.entity_id;
        elsif new.entity_type = 'route' then
            update public.activity_routes
            set likes_count = coalesce(likes_count, 0) + 1
            where id = new.entity_id;
        end if;
        return new;
    elsif tg_op = 'DELETE' then
        if old.entity_type = 'activity' then
            update public.activities
            set likes_count = greatest(coalesce(likes_count, 0) - 1, 0)
            where id = old.entity_id;
        elsif old.entity_type = 'training_plan' then
            update public.training_plans
            set likes_count = greatest(coalesce(likes_count, 0) - 1, 0)
            where id = old.entity_id;
        elsif old.entity_type = 'activity_plan' then
            update public.activity_plans
            set likes_count = greatest(coalesce(likes_count, 0) - 1, 0)
            where id = old.entity_id;
        elsif old.entity_type = 'route' then
            update public.activity_routes
            set likes_count = greatest(coalesce(likes_count, 0) - 1, 0)
            where id = old.entity_id;
        end if;
        return old;
    end if;

    return null;
end;
$$ language plpgsql;

drop trigger if exists likes_insert_trigger on public.likes;
create trigger likes_insert_trigger
    after insert on public.likes
    for each row execute function public.update_likes_count();

drop trigger if exists likes_delete_trigger on public.likes;
create trigger likes_delete_trigger
    after delete on public.likes
    for each row execute function public.update_likes_count();

alter table public.follows disable row level security;
alter table public.likes disable row level security;
