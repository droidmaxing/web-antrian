"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import { readApiError } from "@/lib/api-error";

export function RegistrationForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <label className="block text-sm font-medium text-[#344440]">
      Kata sandi
      <span className="relative mt-2 block">
        <input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={128} className="h-12 w-full rounded-xl bubble-field px-4 pr-12 outline-none" />
        <button
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#626a67] transition hover:text-[#344440]"
        >
          {showPassword ? <EyeOff className="size-[17px]" /> : <Eye className="size-[17px]" />}
        </button>
      </span>
    </label>
    {error && <InlineNotice message={error} />}
    <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-700 text-sm font-semibold text-white disabled:opacity-60">{loading ? <><LoaderCircle className="size-4 animate-spin" />Membuat workspace...</> : <>Buat akun <ArrowRight className="size-4" /></>}</button>
    <p className="text-center text-xs leading-5 text-[#53615b]">Termasuk masa uji coba gratis 30 hari. Tidak perlu memasukkan kartu.</p>
  </form>;
}
