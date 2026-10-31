"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";

/**
 * Layar galat untuk tautan bertoken (QR, status antrean, booking, display).
 * File `error.tsx`/`not-found.tsx` per segmen hanya meneruskan ke sini supaya
 * boundary-nya berada DI DALAM layout bertema, sehingga warna bisnis pemilik
 * token tetap dipakai saat halaman gagal — bukan palet bawaan.
 */
export function TokenRouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Public token route failed", { digest: error.digest });
  }, [error]);

  return (
    <ErrorState
      code="500"
      title="Halaman belum dapat dimuat"
      description="Terjadi gangguan saat menyiapkan halaman ini. Coba lagi sebentar lagi."
      onRetry={retry}
      showLinks={false}
    />
  );
}

export function TokenRouteNotFound() {
  return (
    <ErrorState
      code="404"
      title="Tautan tidak ditemukan"
      description="Tautan ini sudah tidak berlaku, kedaluwarsa, atau salah ketik."
      showLinks={false}
    />
  );
}