"use client";

import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * A token that no longer exists (deleted or rotated display) should say so on
 * the TV itself, not send the viewer to the staff login page.
 */
export default function DisplayNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-brand-900 px-6 text-center text-white">
      <section className="w-full max-w-md">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-white/10">
          <Compass className="size-8 text-brand-300" strokeWidth={1.6} />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Layar ini tidak aktif
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/70">
          Tautan layar sudah tidak berlaku. Minta administrator membuat tautan
          baru dari menu Layar TV.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-white/20 px-5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
        >
          Kembali ke beranda
        </Link>
      </section>
    </main>
  );
}
