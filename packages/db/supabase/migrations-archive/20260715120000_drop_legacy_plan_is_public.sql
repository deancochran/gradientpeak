do $$
begin
  if exists (
    select 1 from public.activity_plans
    where template_visibility not in ('private', 'public')
  ) or exists (
    select 1 from public.training_plans
    where template_visibility not in ('private', 'public')
  ) then
    raise exception 'Plan template_visibility contains unsupported values';
  end if;

  if exists (
    select 1 from public.activity_plans
    where is_public = true and template_visibility <> 'public'
  ) or exists (
    select 1 from public.training_plans
    where is_public = true and template_visibility <> 'public'
  ) then
    raise exception 'Cannot drop plan is_public while it grants access not represented by template_visibility';
  end if;
end $$;

alter table public.activity_plans drop column is_public;
alter table public.training_plans drop column is_public;
