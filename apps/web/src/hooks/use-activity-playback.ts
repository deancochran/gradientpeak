import {
  advancePlayback,
  clampPlaybackElapsed,
  type PlaybackSpeed,
} from "@repo/core/recording/playback";
import { useCallback, useEffect, useRef, useState } from "react";

/** One mounted playback session owns one animation loop. No recording or storage effects. */
export function useActivityPlayback(durationMs: number) {
  const [state, setState] = useState({ elapsedMs: 0, playing: false, speed: 1 as PlaybackSpeed });
  const cursor = useRef(0);
  const running = useRef(false);
  const rate = useRef<PlaybackSpeed>(1);
  const anchor = useRef({ wallMs: 0, elapsedMs: 0 });
  const at = useCallback(
    (wallMs: number) =>
      advancePlayback(
        anchor.current.elapsedMs,
        wallMs - anchor.current.wallMs,
        rate.current,
        durationMs,
      ),
    [durationMs],
  );
  const pause = useCallback(
    (settle = true) => {
      if (running.current && settle) cursor.current = at(performance.now());
      running.current = false;
      setState({ elapsedMs: cursor.current, playing: false, speed: rate.current });
    },
    [at],
  );
  const play = useCallback(() => {
    if (durationMs <= 0 || document.visibilityState === "hidden") return;
    if (cursor.current >= durationMs) cursor.current = 0;
    running.current = true;
    anchor.current = { wallMs: performance.now(), elapsedMs: cursor.current };
    setState({ elapsedMs: cursor.current, playing: true, speed: rate.current });
  }, [durationMs]);
  const seek = useCallback(
    (elapsedMs: number) => {
      running.current = false;
      cursor.current = clampPlaybackElapsed(elapsedMs, durationMs);
      setState({ elapsedMs: cursor.current, playing: false, speed: rate.current });
    },
    [durationMs],
  );
  const setSpeed = useCallback(
    (speed: PlaybackSpeed) => {
      const now = performance.now();
      if (running.current) cursor.current = at(now);
      rate.current = speed;
      anchor.current = { wallMs: now, elapsedMs: cursor.current };
      setState({ elapsedMs: cursor.current, playing: running.current, speed });
    },
    [at],
  );

  useEffect(() => {
    if (!state.playing) return;
    let request = 0;
    let publishedAt = -Infinity;
    const frame = (now: number) => {
      if (!running.current) return;
      if (document.visibilityState === "hidden") {
        pause(false);
        return;
      }
      cursor.current = at(now);
      if (cursor.current >= durationMs) {
        running.current = false;
        setState({ elapsedMs: durationMs, playing: false, speed: rate.current });
        return;
      }
      // Metrics are discrete observations; rendering at 10Hz is sufficient for the display clock.
      if (now - publishedAt >= 100) {
        publishedAt = now;
        setState({ elapsedMs: cursor.current, playing: true, speed: rate.current });
      }
      request = requestAnimationFrame(frame);
    };
    request = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(request);
  }, [at, durationMs, pause, state.playing]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") pause(false);
    };
    const pageHide = () => pause(false);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pageHide);
    return () => {
      running.current = false;
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pageHide);
    };
  }, [pause]);
  return { ...state, play, pause: () => pause(), seek, setSpeed };
}
