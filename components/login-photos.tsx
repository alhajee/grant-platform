"use client";

import { useState } from "react";

export function LoginPhotos() {
  const [paused, setPaused] = useState(false);
  return <>
    <div className="login-scenes" aria-hidden="true" data-paused={paused}>
      <span className="login-scene login-scene-students" />
      <span className="login-scene login-scene-classroom" />
      <span className="login-scene login-scene-school" />
    </div>
    <button type="button" className="login-motion-control login-photo-control" onClick={() => setPaused(value => !value)}>
      {paused ? "Resume slideshow" : "Pause slideshow"}
    </button>
  </>;
}
