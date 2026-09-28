"use client";

import { useEffect, useRef, useState } from "react";

export function LoginVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stopForPreference = () => {
      if (preference.matches) video.current?.pause();
    };
    if (!preference.matches) void video.current?.play().catch(() => {});
    preference.addEventListener("change", stopForPreference);
    return () => preference.removeEventListener("change", stopForPreference);
  }, []);

  return <>
    <div className="login-scenes" aria-hidden="true">
      <video ref={video} className="login-background-video" muted loop playsInline preload="metadata"
        poster="/beap-login-students.webp" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
        <source src="/beap-scenes-motion.mp4" type="video/mp4" />
      </video>
    </div>
    <button type="button" className="login-motion-control" onClick={() => {
      if (playing) video.current?.pause();
      else void video.current?.play().catch(() => {});
    }}>{playing ? "Pause background" : "Play background"}</button>
  </>;
}
