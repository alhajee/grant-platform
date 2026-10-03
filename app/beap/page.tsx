"use client";

import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";

/**
 * The plan overview now lives on the plan page (/beap/review). Older links, bookmarks and notifications
 * that still open /beap?plan=N are replaced with the same plan (and anchor) there.
 */
export default function BeapRedirect() {
  useEffect(() => {
    const { search, hash } = window.location;
    window.location.replace(`/beap/review${search}${hash}`);
  }, []);
  return <main className="beap-main" id="main-content" aria-busy="true"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Opening the plan…</p></main>;
}
