"use client";

import { useEffect } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";

/**
 * Error boundary for the public TV screen. The root boundary links back to
 * /login, which makes no sense on a waiting-room television, so this one
 * stays self-contained and only offers a retry.
 */
export default function DisplayError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Display screen failed", { digest: error.digest });
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-brand-900 px-6 py-10 text-center text-white">
      <section className="w-full max-w-md">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-white/10">
          <CircleAlert className="size-8 text-accent-300" strokeWidth={1.6} />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Layar antrean sedang dimuat ulang
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/70">
          Koneksi ke server antrean terputus. Layar akan mencoba menyambung lagi
          secara otomatis.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-brand-900 transition hover:bg-white/90"
        >
          <RotateCcw className="size-4" />
          Muat ulang layar
        </button>
        {error.digest && (
          <p className="mt-6 font-mono text-[11px] tracking-[.18em] text-white/40">
            {error.digest}
          </p>
        )}
      </section>
    </main>
  );
}
