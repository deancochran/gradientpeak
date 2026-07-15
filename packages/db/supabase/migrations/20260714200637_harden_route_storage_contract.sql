-- Align the private route bucket with the canonical route upload contract.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gpx-routes',
  'gpx-routes',
  false,
  10485760,
  array[
    'application/gpx+xml',
    'application/vnd.garmin.tcx+xml',
    'application/xml'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
