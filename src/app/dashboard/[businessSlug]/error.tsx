"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";

/**
 * Boundary for the operator dashboard. Keeps the operator inside the app
 * (retry first) instead of bouncing them to the login screen on a transient
 * database hiccup.
 */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render failed", { digest: error.digest });
  }, [error]);

  return (
    <ErrorState
      code="500"
      title="Dashboard gagal dimuat"
      description="Data operasional tidak dapat diambil saat ini. Coba muat ulang; sesi dan pengaturan Anda tidak berubah."
      onRetry={retry}
    />
  );
}
