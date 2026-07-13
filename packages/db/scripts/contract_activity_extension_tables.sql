-- NOT AUTO-APPLIED. Future quiescent contract phase; no CASCADE is intentional.
select pg_advisory_xact_lock(hashtextextended('gradientpeak.activity-extension-cutover',0));
lock table public.activities,public.activity_summaries,public.activity_imports,public.activity_geometry,public.activity_laps in access exclusive mode;

-- Final reconciliation while writes are paused. Child non-null values cannot erase parent values.
update public.activities a set
 duration_seconds=coalesce(s.duration_seconds,a.duration_seconds),moving_seconds=coalesce(s.moving_seconds,a.moving_seconds),distance_meters=coalesce(s.distance_meters,a.distance_meters),
 elevation_gain_meters=coalesce(s.elevation_gain_meters,a.elevation_gain_meters),elevation_loss_meters=coalesce(s.elevation_loss_meters,a.elevation_loss_meters),calories=coalesce(s.calories,a.calories),
 avg_heart_rate=coalesce(s.avg_heart_rate,a.avg_heart_rate),max_heart_rate=coalesce(s.max_heart_rate,a.max_heart_rate),avg_power=coalesce(s.avg_power,a.avg_power),max_power=coalesce(s.max_power,a.max_power),normalized_power=coalesce(s.normalized_power,a.normalized_power),
 avg_cadence=coalesce(s.avg_cadence,a.avg_cadence),max_cadence=coalesce(s.max_cadence,a.max_cadence),avg_speed_mps=coalesce(s.avg_speed_mps,a.avg_speed_mps),max_speed_mps=coalesce(s.max_speed_mps,a.max_speed_mps),
 normalized_speed_mps=coalesce(s.normalized_speed_mps,a.normalized_speed_mps),normalized_graded_speed_mps=coalesce(s.normalized_graded_speed_mps,a.normalized_graded_speed_mps),avg_temperature=coalesce(s.avg_temperature,a.avg_temperature),avg_swolf=coalesce(s.avg_swolf,a.avg_swolf),
 efficiency_factor=coalesce(s.efficiency_factor,a.efficiency_factor),aerobic_decoupling=coalesce(s.aerobic_decoupling,a.aerobic_decoupling),pool_length=coalesce(s.pool_length,a.pool_length),total_strokes=coalesce(s.total_strokes,a.total_strokes)
from public.activity_summaries s where a.id=s.activity_id;
update public.activities a set provider=coalesce(i.provider,a.provider),external_id=coalesce(i.external_id,a.external_id),device_manufacturer=coalesce(i.device_manufacturer,a.device_manufacturer),device_product=coalesce(i.device_product,a.device_product),activity_file_path=coalesce(i.activity_file_path,a.activity_file_path),activity_file_size=coalesce(i.activity_file_size,a.activity_file_size),import_source=coalesce(i.import_source,a.import_source),import_file_type=coalesce(i.import_file_type,a.import_file_type),import_original_file_name=coalesce(i.import_original_file_name,a.import_original_file_name) from public.activity_imports i where a.id=i.activity_id;
update public.activities a set polyline=coalesce(g.polyline,a.polyline),map_bounds=coalesce(g.map_bounds,a.map_bounds) from public.activity_geometry g where a.id=g.activity_id;
update public.activities a set laps=x.laps from (select activity_id,jsonb_agg(payload order by lap_index) laps from public.activity_laps group by activity_id) x where a.id=x.activity_id;

drop table if exists public.activity_laps;
drop table if exists public.activity_geometry;
drop table if exists public.activity_imports;
drop table if exists public.activity_summaries;
