-- ============================================================================
-- COMMENTS TABLE
-- ============================================================================

create table if not exists public.comments (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid references public.profiles(id) on delete cascade,
    entity_type text not null check (entity_type in ('activity', 'training_plan', 'activity_plan', 'route')),
    entity_id uuid not null,
    content text not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    constraint comments_content_non_empty check (btrim(content) <> '')
);

create index if not exists idx_comments_entity on public.comments(entity_type, entity_id);
create index if not exists idx_comments_profile_id on public.comments(profile_id, created_at desc);
create index if not exists idx_comments_created_at on public.comments(created_at desc);

create or replace function update_comments_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger update_comments_updated_at
    before update on public.comments
    for each row
    execute function update_comments_updated_at_column();

-- Add comments_count column to relevant tables
alter table public.activities add column if not exists comments_count integer default 0;
alter table public.training_plans add column if not exists comments_count integer default 0;
alter table public.activity_plans add column if not exists comments_count integer default 0;
alter table public.activity_routes add column if not exists comments_count integer default 0;

-- Create function to update comments_count
create or replace function public.update_comments_count()
returns trigger as $$
begin
    if tg_op = 'INSERT' then
        if new.entity_type = 'activity' then
            update public.activities set comments_count = coalesce(comments_count, 0) + 1 where id = new.entity_id;
        elsif new.entity_type = 'training_plan' then
            update public.training_plans set comments_count = coalesce(comments_count, 0) + 1 where id = new.entity_id;
        elsif new.entity_type = 'activity_plan' then
            update public.activity_plans set comments_count = coalesce(comments_count, 0) + 1 where id = new.entity_id;
        elsif new.entity_type = 'route' then
            update public.activity_routes set comments_count = coalesce(comments_count, 0) + 1 where id = new.entity_id;
        end if;
        return new;
    elsif tg_op = 'DELETE' then
        if old.entity_type = 'activity' then
            update public.activities set comments_count = greatest(coalesce(comments_count, 0) - 1, 0) where id = old.entity_id;
        elsif old.entity_type = 'training_plan' then
            update public.training_plans set comments_count = greatest(coalesce(comments_count, 0) - 1, 0) where id = old.entity_id;
        elsif old.entity_type = 'activity_plan' then
            update public.activity_plans set comments_count = greatest(coalesce(comments_count, 0) - 1, 0) where id = old.entity_id;
        elsif old.entity_type = 'route' then
            update public.activity_routes set comments_count = greatest(coalesce(comments_count, 0) - 1, 0) where id = old.entity_id;
        end if;
        return old;
    end if;
    return null;
end;
$$ language plpgsql;

-- Create triggers for comments count
drop trigger if exists comments_insert_trigger on public.comments;
create trigger comments_insert_trigger
    after insert on public.comments
    for each row execute function public.update_comments_count();

drop trigger if exists comments_delete_trigger on public.comments;
create trigger comments_delete_trigger
    after delete on public.comments
    for each row execute function public.update_comments_count();

-- Disable RLS for comments table
alter table public.comments disable row level security;
