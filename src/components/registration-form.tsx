"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import { readApiError } from "@/lib/api-error";

export function RegistrationForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/register", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), companyName: form.get("companyName"), email: form.get("email"), password: form.get("password") }),
      });
      if (!response.ok) {
        setError((await readApiError(response)).message);
        setLoading(false);
        return;
      }
      router.replace("/login?registered=1");
    } catch {
      setError("Tidak dapat menghubungi layanan pendaftaran. Periksa koneksi lalu coba lagi.");
      setLoading(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    <label className="block text-sm font-medium text-[#344440]">Nama lengkap<input name="name" autoComplete="name" required minLength={2} maxLength={80} className="mt-2 h-12 w-full rounded-xl bubble-field px-4 outline-none" /></label>
    <label className="block text-sm font-medium text-[#344440]">Nama bisnis<input name="companyName" required minLength={2} maxLength={80} className="mt-2 h-12 w-full rounded-xl bubble-field px-4 outline-none" /></label>
    <label className="block text-sm font-medium text-[#344440]">Alamat email<input name="email" type="email" autoComplete="email" required maxLength={254} className="mt-2 h-12 w-full rounded-xl bubble-field px-4 outline-none" /></label>
    <label className="block text-sm font-medium text-[#344440]">Kata sandi<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} className="mt-2 h-12 w-full rounded-xl bubble-field px-4 outline-none" /></label>
    {error && <InlineNotice message={error} />}
    <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-700 text-sm font-semibold text-white disabled:opacity-60">{loading ? <><LoaderCircle className="size-4 animate-spin" />Membuat workspace...</> : <>Buat akun <ArrowRight className="size-4" /></>}</button>
    <p className="text-center text-xs leading-5 text-[#53615b]">Termasuk masa uji coba gratis 30 hari. Tidak perlu memasukkan kartu.</p>
  </form>;
}
