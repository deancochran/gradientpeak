ALTER TABLE "group_event_rsvps" DROP CONSTRAINT "group_event_rsvps_status_check";
ALTER TABLE "group_event_rsvps" ADD CONSTRAINT "group_event_rsvps_status_check" CHECK ("status" in ('accepted', 'declined', 'tentative'));

ALTER TABLE "group_event_series_rsvps" DROP CONSTRAINT "group_event_series_rsvps_status_check";
ALTER TABLE "group_event_series_rsvps" ADD CONSTRAINT "group_event_series_rsvps_status_check" CHECK ("status" in ('accepted', 'declined', 'tentative'));
