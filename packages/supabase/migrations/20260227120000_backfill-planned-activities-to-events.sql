insert into public.events (
    id,
    profile_id,
    event_type,
    status,
    title,
    all_day,
    starts_at,
    ends_at,
    timezone,
    activity_plan_id,
    training_plan_id,
    occurrence_key,
    notes,
    created_at,
    updated_at
)
select
    planned.id,
    planned.profile_id,
    'planned_activity'::public.event_type,
    'scheduled'::public.event_status,
    coalesce(activity_plan.name, 'Planned activity') as title,
    true as all_day,
    planned.scheduled_date::timestamp at time zone 'UTC' as starts_at,
    (planned.scheduled_date::timestamp at time zone 'UTC') + interval '1 day' as ends_at,
    'UTC' as timezone,
    planned.activity_plan_id,
    planned.training_plan_id,
    'planned:' || planned.id::text as occurrence_key,
    planned.notes,
    planned.created_at,
    planned.updated_at
from public.planned_activities as planned
left join public.activity_plans as activity_plan
    on activity_plan.id = planned.activity_plan_id
on conflict (id) do update
set
    profile_id = excluded.profile_id,
    event_type = excluded.event_type,
    status = excluded.status,
    title = excluded.title,
    all_day = excluded.all_day,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    timezone = excluded.timezone,
    activity_plan_id = excluded.activity_plan_id,
    training_plan_id = excluded.training_plan_id,
    occurrence_key = excluded.occurrence_key,
    notes = excluded.notes,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;
