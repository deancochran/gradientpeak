create extension if not exists "uuid-ossp" with schema extensions;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'notification_type' and n.nspname = 'public'
  ) then
    create type public.notification_type as enum (
      'new_message',
      'coaching_invitation',
      'coaching_invitation_accepted',
      'coaching_invitation_declined',
      'new_follower',
      'follow_request'
    );
  end if;
end $$;

alter table public.notifications
  add column if not exists user_id uuid,
  add column if not exists actor_id uuid,
  add column if not exists type public.notification_type,
  add column if not exists entity_id uuid,
  add column if not exists read_at timestamptz;

update public.notifications
set user_id = coalesce(user_id, profile_id)
where user_id is null
  and profile_id is not null;

update public.notifications
set actor_id = coalesce(actor_id, profile_id)
where actor_id is null
  and profile_id is not null;

update public.notifications
set type = coalesce(type, 'new_message'::public.notification_type)
where type is null;

update public.notifications
set read_at = coalesce(read_at, case when is_read then created_at else null end)
where read_at is null
  and is_read is not null;

alter table public.notifications
  alter column user_id set not null,
  alter column actor_id set not null,
  alter column type set not null;

alter table public.notifications drop constraint if exists notifications_profile_id_fkey;
alter table public.notifications drop constraint if exists notifications_user_id_fkey;
alter table public.notifications drop constraint if exists notifications_actor_id_fkey;

alter table public.notifications
  add constraint notifications_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.notifications
  add constraint notifications_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete cascade;

drop index if exists idx_notifications_profile_id;
drop index if exists idx_notifications_is_read;
create index if not exists idx_notifications_user_id on public.notifications (user_id);
create index if not exists idx_notifications_read_at on public.notifications (read_at);

alter table public.notifications drop column if exists profile_id;
alter table public.notifications drop column if exists title;
alter table public.notifications drop column if exists message;
alter table public.notifications drop column if exists is_read;

create table if not exists public.conversations (
  id uuid primary key default extensions.uuid_generate_v4(),
  is_group boolean not null default false,
  group_name text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default extensions.uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 5000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  read_at timestamptz
);

create index if not exists idx_messages_conversation_id on public.messages (conversation_id);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Users can access conversations they are a part of" on public.conversations;
create policy "Users can access conversations they are a part of" on public.conversations
  for select using (id in (select conversation_id from public.conversation_participants where user_id = auth.uid()));

drop policy if exists "Users can access participant info for conversations they are in" on public.conversation_participants;
create policy "Users can access participant info for conversations they are in" on public.conversation_participants
  for select using (conversation_id in (select conversation_id from public.conversation_participants where user_id = auth.uid()));

drop policy if exists "Users can manage their own participation" on public.conversation_participants;
create policy "Users can manage their own participation" on public.conversation_participants
  for all using (user_id = auth.uid());

drop policy if exists "Users can access messages in conversations they are a part of" on public.messages;
create policy "Users can access messages in conversations they are a part of" on public.messages
  for select using (conversation_id in (select conversation_id from public.conversation_participants where user_id = auth.uid()));

drop policy if exists "Users can insert messages in conversations they are a part of" on public.messages;
create policy "Users can insert messages in conversations they are a part of" on public.messages
  for insert with check (conversation_id in (select conversation_id from public.conversation_participants where user_id = auth.uid()) and sender_id = auth.uid());

drop policy if exists "Users can soft-delete their own messages" on public.messages;
create policy "Users can soft-delete their own messages" on public.messages
  for update using (sender_id = auth.uid()) with check (sender_id = auth.uid());

drop policy if exists "Users can view and manage their own notifications" on public.notifications;
create policy "Users can view and manage their own notifications" on public.notifications
  for all using (user_id = auth.uid());
