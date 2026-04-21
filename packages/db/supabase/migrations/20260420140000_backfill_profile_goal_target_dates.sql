update public.profile_goals as pg
set
  target_date = (timezone('UTC', e.starts_at))::date,
  updated_at = now()
from public.events as e
where pg.target_date is null
  and e.id = pg.milestone_event_id;
