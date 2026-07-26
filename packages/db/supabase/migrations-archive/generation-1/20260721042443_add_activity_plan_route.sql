alter table public.activity_plans
  add column route_id uuid,
  add constraint activity_plans_route_id_activity_routes_id_fk
    foreign key (route_id)
    references public.activity_routes(id)
    on delete set null;

create index idx_activity_plans_route_id
  on public.activity_plans using btree (route_id)
  where route_id is not null;
