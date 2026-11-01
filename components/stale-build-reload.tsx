"use client";

import { useEffect } from "react";

// A tab left open across a deploy asks for script chunks of the old build, which no longer exist (production 404).
// When such a chunk fails to load, reload the page once to pick up the current build instead of leaving the page
// half-working (client, 1 November 2026: the "shaking" sign-in glitch after deployments). One reload per minute at most.
const key = "beapms:stale-build-reload";
const chunkFailure = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|ChunkLoadError/i;

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch { /* storage blocked: still reload once for this page */ }
  window.location.reload();
}

export function StaleBuildReload() {
  useEffect(() => {
    const onPreload = (event: Event) => { event.preventDefault(); reloadOnce(); };
    const onRejection = (event: PromiseRejectionEvent) => { const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? ""); if (chunkFailure.test(message)) reloadOnce(); };
    // A <script> or modulepreload <link> of the build that failed to load (capture: resource errors do not bubble).
    const onError = (event: Event) => {
      const target = event.target as HTMLScriptElement | HTMLLinkElement | null;
      const url = target && ("src" in target ? target.src : "href" in target ? target.href : "");
      if (url && url.includes("/_next/static/")) reloadOnce();
    };
    window.addEventListener("vite:preloadError", onPreload);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError, true);
    return () => { window.removeEventListener("vite:preloadError", onPreload); window.removeEventListener("unhandledrejection", onRejection); window.removeEventListener("error", onError, true); };
  }, []);
  return null;
}
