"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleAlert, Compass, RotateCcw } from "lucide-react";

export function ErrorState({
  code,
  title,
  description,
  onRetry,
  showLinks = true,
}: {
  code: string;
  title: string;
  description: string;
  onRetry?: () => void;
  showLinks?: boolean;
}) {
  return (
    <main className="bubble-flow relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <span aria-hidden className="bubble-blob -left-32 -top-24 -z-10 size-80 opacity-60" />
      <span aria-hidden className="bubble-blob -bottom-32 -right-16 -z-10 size-96 opacity-50" style={{ animationDelay: "-9s, -4s" }} />
      <section className="bubble-card relative w-full max-w-lg bg-white/90 p-7 text-center backdrop-blur sm:p-10">
        <Link
          href="/login"
          aria-label="Antrian, kembali ke halaman masuk"
          className="mx-auto flex w-fit items-center gap-2 text-sm font-semibold tracking-tight text-brand-900"
        >
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-brand-700 text-sm font-black text-white">
            a.
          </span>
          antrian
        </Link>
        <div className="bubble-icon mx-auto mt-9 size-[76px] animate-bubble-float">
          {code === "404" ? (
            <Compass className="size-9" strokeWidth={1.6} />
          ) : (
            <CircleAlert className="size-9" strokeWidth={1.6} />
          )}
        </div>
        <p className="mt-6 text-[11px] font-bold uppercase tracking-[.22em] text-brand-600">
          {code === "404" ? "Halaman tidak ditemukan" : "Ada kendala"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] text-brand-900 sm:text-[30px]">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-brand-900/70">
          {description}
        </p>
        <p className="mt-5 font-mono text-[11px] tracking-[.18em] text-brand-900/45">
          {code}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-2.5 sm:flex-row">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white transition hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-700/20"
            >
              <RotateCcw className="size-4" />
              Coba lagi
            </button>
          )}
          {showLinks && (
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bubble-btn bg-white px-5 text-sm font-semibold text-brand-900/75 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-700/10"
            >
              <ArrowLeft className="size-4" />
              Halaman masuk
            </Link>
          )}
          {showLinks && (
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-700/10"
            >
              Beranda <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
        <p className="mt-8 text-[11px] text-brand-900/45">
          Jika masalah berlanjut, coba muat ulang atau hubungi administrator.
        </p>
      </section>
    </main>
  );
}
