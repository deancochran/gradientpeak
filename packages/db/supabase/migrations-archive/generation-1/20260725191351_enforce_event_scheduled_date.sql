-- Backfill exactly the former read-time anchor before making it mandatory.
-- The application treated unsupported zones as UTC; PostgreSQL only evaluates
-- a stored zone when it is known to its timezone catalog.
update public.events
set scheduled_date = to_char(
  starts_at at time zone case
    when timezone in (select name from pg_timezone_names) then timezone
    else 'UTC'
  end,
  'YYYY-MM-DD'
)
where scheduled_date is null;

alter table public.events
  alter column scheduled_date set not null;
