"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { FieldError, InlineNotice } from "@/components/inline-notice";

const EMPTY = { code: "", name: "", description: "", monthlyPrice: "", yearlyPrice: "" };

/**
 * Creates a plan. Prices are plain rupiah integers; the server schema
 * (`planSchema`) is the authority on what is accepted.
 */
export function PlatformPlanForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  function update(key: keyof typeof EMPTY) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setFields({});
    setMessage("");
    try {
      const response = await fetch("/api/v1/platform/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          description: form.description.trim() || null,
          monthlyPrice: Number(form.monthlyPrice || 0),
          yearlyPrice: Number(form.yearlyPrice || 0),
          active: true,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string; fields?: Record<string, string> }; data?: { name?: string } }
        | null;
      if (!response.ok) {
        setFields(body?.error?.fields ?? {});
        throw new Error(body?.error?.message ?? "Paket gagal disimpan.");
      }
      setForm(EMPTY);
      setMessage(`Paket ${body?.data?.name ?? form.name} tersimpan.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
    } finally {
      setPending(false);
    }
  }

  const input =
    "mt-1 h-9 w-full bubble-field px-2.5 text-xs text-[#344440] outline-none";

  return (
    <details className="bubble-card p-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-brand-900">
        <Plus className="size-4" /> Tambah paket
      </summary>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-[11px] font-semibold text-[#52615b]">
          Kode paket
          <input value={form.code} onChange={update("code")} className={input} placeholder="basic" aria-describedby="plan-code-error" />
          <FieldError id="plan-code-error" message={fields.code} />
        </label>
        <label className="block text-[11px] font-semibold text-[#52615b]">
          Nama paket
          <input value={form.name} onChange={update("name")} className={input} placeholder="Paket Dasar" aria-describedby="plan-name-error" />
          <FieldError id="plan-name-error" message={fields.name} />
        </label>
        <label className="block text-[11px] font-semibold text-[#52615b]">
          Harga bulanan (Rp)
          <input value={form.monthlyPrice} onChange={update("monthlyPrice")} inputMode="numeric" className={input} placeholder="150000" aria-describedby="plan-monthly-error" />
          <FieldError id="plan-monthly-error" message={fields.monthlyPrice} />
        </label>
        <label className="block text-[11px] font-semibold text-[#52615b]">
          Harga tahunan (Rp)
          <input value={form.yearlyPrice} onChange={update("yearlyPrice")} inputMode="numeric" className={input} placeholder="1500000" aria-describedby="plan-yearly-error" />
          <FieldError id="plan-yearly-error" message={fields.yearlyPrice} />
        </label>
        <label className="block text-[11px] font-semibold text-[#52615b] sm:col-span-2">
          Deskripsi (opsional)
          <textarea value={form.description} onChange={update("description")} rows={2} className="mt-1 w-full rounded-lg bubble-field bg-white px-2.5 py-2 text-xs text-[#344440] outline-none" />
        </label>
        {error && <InlineNotice message={error} className="sm:col-span-2" />}
        {message && <InlineNotice message={message} variant="success" className="sm:col-span-2" />}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:cursor-progress disabled:opacity-60 sm:col-span-2 sm:w-fit"
        >
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          Simpan paket
        </button>
      </form>
    </details>
  );
}
