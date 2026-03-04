create table "activity_streams" (
  "id" bigserial primary key,
  "activity_id" uuid not null references "activities"("id") on delete cascade,
  "type" text not null,  -- 'distance', 'heartrate', 'power', 'latlng', 'moving'
  "resolution" text check ("resolution" in ('low', 'medium', 'high')),
  "original_size" integer not null,

  "data" double precision[],
  "data_latlng" double precision[][],
  "data_moving" boolean[],

  "created_at" timestamptz not null default now(),

  constraint "uq_activity_stream_type" unique ("activity_id", "type")
);
