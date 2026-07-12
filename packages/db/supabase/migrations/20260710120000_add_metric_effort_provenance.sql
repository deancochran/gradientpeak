create type public.evidence_observation_source as enum (
  'manual',
  'test',
  'imported',
  'provider',
  'estimated',
  'derived'
);

alter table public.activity_efforts
  add column source public.evidence_observation_source,
  add column method text,
  add column calculation_version text,
  add column quality_score numeric,
  add column provenance jsonb,
  add constraint activity_efforts_method_not_blank_check
    check (method is null or btrim(method) <> ''),
  add constraint activity_efforts_calculation_version_not_blank_check
    check (calculation_version is null or btrim(calculation_version) <> ''),
  add constraint activity_efforts_quality_score_range_check
    check (quality_score is null or (quality_score >= 0 and quality_score <= 1)),
  add constraint activity_efforts_provenance_object_check
    check (provenance is null or jsonb_typeof(provenance) = 'object');

alter table public.profile_metrics
  add column source public.evidence_observation_source,
  add column method text,
  add column calculation_version text,
  add column quality_score numeric,
  add column provenance jsonb,
  add constraint profile_metrics_method_not_blank_check
    check (method is null or btrim(method) <> ''),
  add constraint profile_metrics_calculation_version_not_blank_check
    check (calculation_version is null or btrim(calculation_version) <> ''),
  add constraint profile_metrics_quality_score_range_check
    check (quality_score is null or (quality_score >= 0 and quality_score <= 1)),
  add constraint profile_metrics_provenance_object_check
    check (provenance is null or jsonb_typeof(provenance) = 'object');
