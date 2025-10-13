create or replace function create_activity(
    activity jsonb,
    activity_streams jsonb
) returns jsonb as $$
declare
    new_activity activities%rowtype;
    stream_item jsonb;
begin
    -- insert activity
    insert into activities
    select *
    from jsonb_populate_record(null::activities, activity)
    returning * into new_activity;

    -- insert streams (no need to store/return them)
    for stream_item in
        select * from jsonb_array_elements(activity_streams)
    loop
        insert into activity_streams
        select
            new_activity.id as activity_id,
            *
        from jsonb_populate_record(null::activity_streams, stream_item);
    end loop;

    -- return only the inserted activity
    return to_jsonb(new_activity);
end;
$$ language plpgsql;
