begin;

alter table public.training_plan_application_command_receipts
  drop constraint training_plan_application_command_receipts_command_check;
alter table public.training_plan_application_command_receipts
  add constraint training_plan_application_command_receipts_command_check
  check (command in ('apply', 'update', 'remove', 'save_plan'));

commit;
