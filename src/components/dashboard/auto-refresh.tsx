"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically re-runs the current server component so changes made by
 * teammates (e.g. a new project) appear without a manual refresh. Mirrors the
 * polling already used in the review and chat views. Client state (open dialogs,
 * text being typed) is preserved across a router.refresh().
 */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
