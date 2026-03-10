-- Deprecated migration body retained as replay-safe compatibility migration.
-- Historical system template seeding is handled elsewhere.
do $$
begin
  alter table public.training_plans
    add column if not exists likes_count integer default 0;

  null;
end
$$;
