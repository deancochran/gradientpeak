export type WebRecordingAdapter = {
  id: "manual-timer";
  label: string;
  description: string;
  liveRecording: true;
  durableLocalQueue: true;
};

export function createWebRecordingAdapterRegistry(): WebRecordingAdapter[] {
  return [
    {
      id: "manual-timer",
      label: "Indoor timer",
      description: "Foreground timer, durable recovery, review, and queued activity saving.",
      liveRecording: true,
      durableLocalQueue: true,
    },
  ];
}
