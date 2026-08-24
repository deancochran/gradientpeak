ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS route_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activities_route_id_activity_routes_id_fk'
      AND conrelid = 'public.activities'::regclass
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_route_id_activity_routes_id_fk
      FOREIGN KEY (route_id)
      REFERENCES public.activity_routes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activities_route
  ON public.activities USING btree (route_id)
  WHERE route_id IS NOT NULL;
