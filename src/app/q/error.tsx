"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";

export default function QueueError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Queue screen render failed", { digest: error.digest });
  }, [error]);

  return (
    <ErrorState
      code="500"
      title="Halaman antrean belum bisa dibuka"
      description="Nomor antrean Anda tetap tersimpan. Muat ulang halaman ini beberapa saat lagi."
      onRetry={retry}
      showLinks={false}
    />
  );
}