select pg_advisory_xact_lock(
  hashtextextended('gradientpeak.drop_multisport_cutover_audits', 0)
);

drop table public.multisport_cutover_template_audits;
drop table public.multisport_cutover_audits;
