-- add participant messaging read cursor
-- Expand messaging read state from the legacy message-global marker to a
-- participant-owned cursor. The nullable cursor keeps pre-existing unread
-- state conservative when no unambiguous legacy DM receipt exists.
alter table public.conversation_participants
  add column last_read_at timestamp with time zone,
  add column last_read_message_id uuid,
  add constraint conversation_participants_read_cursor_pair_check
    check ((last_read_at is null) = (last_read_message_id is null));

-- Legacy mark-as-read only supported two-person direct conversations and
-- marked messages sent by the other participant. That makes those receipts
-- safe to translate. Group rows are intentionally left null because one
-- global message.read_at value cannot identify which group members read it.
with legacy_dm_participants as (
  select
    participant.conversation_id,
    participant.user_id
  from public.conversation_participants participant
  inner join public.conversations conversation
    on conversation.id = participant.conversation_id
   and conversation.is_group = false
  where (
    select count(*)
    from public.conversation_participants dm_participant
    where dm_participant.conversation_id = participant.conversation_id
  ) = 2
), ordered_legacy_receipts as (
  select
    participant.conversation_id,
    participant.user_id,
    message.id,
    message.created_at,
    sum(case when message.read_at is null then 1 else 0 end) over (
      partition by participant.conversation_id, participant.user_id
      order by message.created_at, message.id
      rows between unbounded preceding and current row
    ) as unread_in_prefix
  from legacy_dm_participants participant
  inner join public.messages message
    on message.conversation_id = participant.conversation_id
   and message.sender_id <> participant.user_id
   and message.deleted_at is null
), legacy_dm_cursors as (
  select distinct on (conversation_id, user_id)
    conversation_id,
    user_id,
    created_at as last_read_at,
    id as last_read_message_id
  from ordered_legacy_receipts
  where unread_in_prefix = 0
  order by conversation_id, user_id, created_at desc, id desc
)
update public.conversation_participants participant
set
  last_read_at = cursor.last_read_at,
  last_read_message_id = cursor.last_read_message_id
from legacy_dm_cursors cursor
where participant.conversation_id = cursor.conversation_id
  and participant.user_id = cursor.user_id;
