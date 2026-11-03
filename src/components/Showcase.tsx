"use client";

import { useEffect, useRef, useState } from "react";

// Browsers only autoplay muted video, so every showcase starts muted and offers a sound toggle.
// Playback runs only while the video is on screen, which keeps the page light with several ads on it.
// WebM first: it plays everywhere, including headless Chromium (which Vist itself browses with); MP4 as fallback.
export function Showcase({ name }: { name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const toggleSound = () => {
    const video = ref.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted) {
      // Turning sound on should feel like starting the ad, so restart it if it's near the end.
      if (video.duration && video.currentTime > video.duration - 3) video.currentTime = 0;
      video.play().catch(() => {});
    }
  };

  return (
    <div className="group relative">
      <video
        ref={ref}
        muted
        loop
        playsInline
        controls={!muted}
        preload="metadata"
        poster={`/showcase/${name}.jpg`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        className="block aspect-video w-full bg-black"
      >
        <source src={`/showcase/${name}.webm`} type="video/webm" />
        <source src={`/showcase/${name}.mp4`} type="video/mp4" />
      </video>
      {muted && (
        <button
          type="button"
          onClick={toggleSound}
          className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-black/85"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
          {playing ? "Tap for sound" : "Play with sound"}
        </button>
      )}
    </div>
  );
}
