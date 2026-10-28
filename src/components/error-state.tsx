"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleAlert, Compass, RotateCcw } from "lucide-react";

export function ErrorState({
  code,
  title,
  description,
  onRetry,
}: {
  code: string;
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f4f7f5] px-4 py-10">
      <div className="pointer-events-none absolute -left-28 -top-32 size-80 rounded-full bg-[#dcefe6]/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-96 rounded-full bg-[#e9e8f4]/70 blur-3xl" />
      <section className="relative w-full max-w-lg rounded-[28px] border border-white/80 bg-white/90 p-7 text-center shadow-[0_24px_80px_rgba(34,67,53,.10)] backdrop-blur sm:p-10">
        <Link
          href="/login"
          aria-label="Antrian, kembali ke halaman masuk"
          className="mx-auto flex w-fit items-center gap-2 text-sm font-semibold tracking-tight text-[#24483c]"
        >
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-brand-700 text-sm font-black text-white">
            a.
          </span>
          antrian
        </Link>
        <div className="mx-auto mt-9 flex size-[76px] items-center justify-center rounded-[24px] bg-[#edf6f1] text-[#367d63] shadow-inner">
          {code === "404" ? (
            <Compass className="size-9" strokeWidth={1.6} />
          ) : (
            <CircleAlert className="size-9" strokeWidth={1.6} />
          )}
        </div>
        <p className="mt-6 text-[11px] font-bold uppercase tracking-[.22em] text-[#52836c]">
          {code === "404" ? "Halaman tidak ditemukan" : "Ada kendala"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] text-[#24332e] sm:text-[30px]">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#7c8984]">
          {description}
        </p>
        <p className="mt-5 font-mono text-[11px] tracking-[.18em] text-[#a2ada8]">
          {code}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-2.5 sm:flex-row">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 text-sm font-semibold text-white transition hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-700/20"
            >
              <RotateCcw className="size-4" />
              Coba lagi
            </button>
          )}
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e4ebe7] bg-white px-5 text-sm font-semibold text-[#52615b] transition hover:bg-[#f7faf8] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-700/10"
          >
            <ArrowLeft className="size-4" />
            Halaman masuk
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-[#527c68] transition hover:bg-[#f1f7f4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-700/10"
          >
            Beranda <ArrowRight className="size-4" />
          </Link>
        </div>
        <p className="mt-8 text-[10px] text-[#a0aaa6]">
          Jika masalah berlanjut, coba muat ulang atau hubungi administrator.
        </p>
      </section>
    </main>
  );
}
