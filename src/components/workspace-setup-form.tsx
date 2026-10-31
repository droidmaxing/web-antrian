"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import { readApiError } from "@/lib/api-error";

export function WorkspaceSetupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyName: form.get("companyName") }),
      });
      if (!response.ok) {
        setError((await readApiError(response)).message);
        setLoading(false);
        return;
      }
      const payload = (await response.json()) as { data?: { businessSlug?: string } };
      const slug = payload.data?.businessSlug;
      if (!slug) {
        setError("Workspace dibuat, tetapi tautan dashboard tidak terbaca. Muat ulang halaman ini.");
        setLoading(false);
        return;
      }
      router.replace(`/dashboard/${slug}`);
    } catch {
      setError("Tidak dapat menghubungi layanan pendaftaran. Periksa koneksi lalu coba lagi.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium text-[#344440]">
        Nama bisnis
        <input
          name="companyName"
          required
          minLength={2}
          maxLength={80}
          placeholder="Contoh: Klinik Sehat Sentosa"
          className="mt-2 h-12 w-full rounded-xl bubble-field px-4 outline-none"
        />
      </label>
      {error && <InlineNotice message={error} />}
      <button
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-700 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            Menyiapkan workspace...
          </>
        ) : (
          <>
            Buat workspace <ArrowRight className="size-4" />
          </>
        )}
      </button>
      <p className="text-center text-xs leading-5 text-[#53615b]">
        Cabang utama dan masa uji coba 30 hari disiapkan otomatis.
      </p>
    </form>
  );
}
