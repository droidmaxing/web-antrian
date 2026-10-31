"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";

export default function BookingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Booking screen render failed", { digest: error.digest });
  }, [error]);

  return (
    <ErrorState
      code="500"
      title="Halaman booking belum bisa dibuka"
      description="Booking Anda tidak hilang. Muat ulang halaman ini beberapa saat lagi."
      onRetry={retry}
      showLinks={false}
    />
  );
}