alter table public.accounts drop constraint if exists accounts_user_id_users_id_fk;
alter table public.accounts drop constraint if exists accounts_user_id_fkey;
alter table public.sessions drop constraint if exists sessions_user_id_users_id_fk;
alter table public.sessions drop constraint if exists sessions_user_id_fkey;
alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.users
  alter column id type uuid using id::uuid;

alter table public.accounts
  alter column user_id type uuid using user_id::uuid;

alter table public.sessions
  alter column user_id type uuid using user_id::uuid;

alter table public.accounts
  add constraint accounts_user_id_users_id_fk
  foreign key (user_id) references public.users(id) on delete cascade;

alter table public.sessions
  add constraint sessions_user_id_users_id_fk
  foreign key (user_id) references public.users(id) on delete cascade;

alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references public.users(id) on delete cascade;
