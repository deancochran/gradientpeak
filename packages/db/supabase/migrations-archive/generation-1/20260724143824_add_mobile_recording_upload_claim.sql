-- add mobile recording upload claim
update storage.buckets
set allowed_mime_types = array[
  'application/fit',
  'application/gpx+xml',
  'application/octet-stream',
  'application/tcx+xml',
  'application/vnd.ant.fit',
  'application/vnd.garmin.tcx+xml',
  'application/xml',
  'text/xml'
]::text[]
where id = 'activity-files';

alter table public.activity_file_ingestions
  add column staging_bucket text,
  add column staging_path text,
  add column expected_sha256 text,
  add column expected_byte_size integer,
  add column expected_format text,
  add column expected_media_type text,
  add column accepted_sha256 text,
  add column accepted_byte_size integer,
  add column accepted_bucket text,
  add column accepted_path text,
  add column accepted_media_type text,
  add column accepted_format text,
  add column uploaded_at timestamptz,
  add column staging_cleanup_pending boolean not null default false,
  add column staging_cleaned_at timestamptz,
  add column staging_cleanup_error text,
  add constraint activity_file_ingestions_expected_size_check check (expected_byte_size is null or expected_byte_size > 0) not valid,
  add constraint activity_file_ingestions_accepted_size_check check (accepted_byte_size is null or accepted_byte_size > 0) not valid,
  add constraint activity_file_ingestions_expected_hash_check check (expected_sha256 is null or expected_sha256 ~ '^[0-9a-f]{64}$') not valid,
  add constraint activity_file_ingestions_accepted_hash_check check (accepted_sha256 is null or accepted_sha256 ~ '^[0-9a-f]{64}$') not valid,
  add constraint activity_file_ingestions_staging_metadata_check check (
    num_nonnulls(staging_bucket, staging_path, expected_sha256, expected_byte_size, expected_format, expected_media_type) in (0, 6)
    and (
      staging_bucket is null
      or (
        btrim(staging_bucket) <> ''
        and btrim(staging_path) <> ''
        and (
          (expected_format = 'fit' and expected_media_type = 'application/vnd.ant.fit')
          or (expected_format = 'gpx' and expected_media_type = 'application/gpx+xml')
          or (expected_format = 'tcx' and expected_media_type = 'application/vnd.garmin.tcx+xml')
        )
      )
    )
  ) not valid,
  add constraint activity_file_ingestions_accepted_metadata_check check (
    num_nonnulls(accepted_sha256, accepted_byte_size, accepted_bucket, accepted_path, accepted_media_type, accepted_format, uploaded_at) in (0, 7)
    and (
      accepted_sha256 is null
      or (
        status = 'ready'
        and btrim(accepted_bucket) <> ''
        and btrim(accepted_path) <> ''
        and accepted_format in ('fit', 'gpx', 'tcx')
        and accepted_path = 'artifacts/sha256/' || profile_id::text || '/' || accepted_sha256
      )
    )
  ) not valid,
  add constraint activity_file_ingestions_claim_artifact_match_check check (
    expected_sha256 is null
    or accepted_sha256 is null
    or (
      accepted_sha256 = expected_sha256
      and accepted_byte_size = expected_byte_size
      and accepted_bucket = staging_bucket
      and accepted_format = expected_format
      and accepted_media_type = expected_media_type
    )
  ) not valid,
  add constraint activity_file_ingestions_cleanup_state_check check (
    (not staging_cleanup_pending or (status = 'ready' and staging_path is not null and accepted_path is not null))
    and (staging_cleaned_at is null or (not staging_cleanup_pending and staging_path is not null))
    and (staging_cleanup_error is null or staging_cleanup_pending)
    and not (staging_cleaned_at is not null and staging_cleanup_error is not null)
  ) not valid,
  add constraint activity_file_ingestions_processing_claim_check check (
    (status = 'processing' and claim_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and claim_token is null and lease_expires_at is null)
  ) not valid;
