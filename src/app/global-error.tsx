"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";
import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Root layout render failed", { digest: error.digest });
  }, [error]);

  return (
    <html lang="id">
      <body className="bubble-flow min-h-screen font-sans text-brand-900">
        <ErrorState
          code="500"
          title="Aplikasi sedang mengalami gangguan"
          description="Ada masalah saat menyiapkan aplikasi. Coba muat ulang halaman."
          onRetry={retry}
        />
      </body>
    </html>
  );
}
