"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, LoaderCircle, Palette, RotateCcw, Trash2, Upload } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import { LOGO_MAX_LENGTH, logoDataUrl, type BrandTheme } from "@/modules/tenancy/brand";

/** 300 KB on disk; the API caps the base64 payload at LOGO_MAX_LENGTH chars. */
const MAX_LOGO_BYTES = 300_000;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

const PRESETS = [
  { label: "Hijau antrian", value: "#176b5b" },
  { label: "Biru laut", value: "#1d5f9c" },
  { label: "Ungu", value: "#5b4bb7" },
  { label: "Oranye", value: "#b8622a" },
  { label: "Merah", value: "#a83a4b" },
];

/** Prefers the per-field message so an upload problem is stated precisely. */
function apiMessage(result: unknown, fallback: string) {
  const error = (result as { error?: { message?: string; fields?: Record<string, string> } })
    ?.error;
  return error?.fields?.logo ?? error?.fields?.primaryColor ?? error?.message ?? fallback;
}

/**
 * Super Admin workspace branding. The colour is previewed locally before saving;
 * persistence and validation are the API's job, so nothing here is trusted.
 */
export function ThemeSettings({
  businessSlug,
  initialTheme,
}: {
  businessSlug: string;
  initialTheme: BrandTheme;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [current, setCurrent] = useState(initialTheme);
  const [primaryColor, setPrimaryColor] = useState(initialTheme.primaryColor);
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const previewSrc = removeLogo ? null : (pendingLogo ?? logoDataUrl(current));
  const colorChanged = primaryColor.toLowerCase() !== current.primaryColor.toLowerCase();
  const hasChanges = colorChanged || removeLogo || pendingLogo !== null;

  function pickFile(file: File | undefined) {
    setError("");
    setSaved("");
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setError("Format logo harus PNG, JPEG, atau WebP.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(
        `Logo ${Math.round(file.size / 1000)} KB terlalu besar. Maksimal ${MAX_LOGO_BYTES / 1000} KB.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("Berkas tidak dapat dibaca. Pilih ulang berkasnya.");
        return;
      }
      if (reader.result.length > LOGO_MAX_LENGTH + 64) {
        setError("Logo terlalu besar setelah dikodekan. Gunakan berkas yang lebih kecil.");
        return;
      }
      setPendingLogo(reader.result);
      setRemoveLogo(false);
    };
    reader.onerror = () => setError("Berkas tidak dapat dibaca. Pilih ulang berkasnya.");
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!hasChanges) {
      setError("Belum ada perubahan untuk disimpan.");
      return;
    }
    setBusy("save");
    setError("");
    setSaved("");
    try {
      const body: { primaryColor?: string; logo?: string | null } = {};
      if (colorChanged) body.primaryColor = primaryColor;
      if (removeLogo) body.logo = null;
      else if (pendingLogo) body.logo = pendingLogo;

      const response = await fetch(`/api/v1/businesses/${businessSlug}/theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiMessage(result, "Pengaturan tampilan gagal disimpan."));
      }
      const theme = result.data as BrandTheme;
      setCurrent(theme);
      setPrimaryColor(theme.primaryColor);
      setPendingLogo(null);
      setRemoveLogo(false);
      if (fileRef.current) fileRef.current.value = "";
      setSaved("Pengaturan tampilan tersimpan.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Terjadi kesalahan.");
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setError("");
    setSaved("");
    try {
      const response = await fetch(`/api/v1/businesses/${businessSlug}/theme`, {
        method: "DELETE",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiMessage(result, "Tampilan bawaan gagal dipulihkan."));
      }
      const theme = result.data as BrandTheme;
      setCurrent(theme);
      setPrimaryColor(theme.primaryColor);
      setPendingLogo(null);
      setRemoveLogo(false);
      if (fileRef.current) fileRef.current.value = "";
      setSaved("Warna dan logo dikembalikan ke tampilan standar.");
      router.refresh();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Terjadi kesalahan.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[#e9edeb] bg-white p-5 shadow-[0_2px_8px_rgba(25,48,40,.025)] md:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Palette className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-.02em]">Warna dan logo</h2>
          <p className="mt-0.5 text-xs text-[#929e99]">
            Hanya Super Admin. Berlaku di dashboard, halaman QR, booking, dan layar TV.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <label htmlFor="primary-color" className="text-xs font-semibold text-[#40504a]">
            Warna utama
          </label>
          <div className="mt-2 flex items-center gap-2.5">
            <input
              id="primary-color"
              type="color"
              value={primaryColor}
              onChange={(event) => {
                setPrimaryColor(event.target.value);
                setSaved("");
              }}
              className="size-11 cursor-pointer rounded-xl border border-[#e1e7e4] bg-white p-1"
            />
            <input
              type="text"
              inputMode="text"
              aria-label="Kode warna heksadesimal"
              value={primaryColor}
              maxLength={7}
              onChange={(event) => {
                setPrimaryColor(event.target.value);
                setSaved("");
              }}
              className="h-11 w-32 rounded-xl border border-[#e1e7e4] px-3 font-mono text-xs uppercase text-[#344440] outline-none focus:border-[#79b39e] focus:ring-4 focus:ring-brand-700/[.08]"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => {
                  setPrimaryColor(preset.value);
                  setSaved("");
                }}
                aria-label={`Pakai warna ${preset.label}`}
                aria-pressed={primaryColor.toLowerCase() === preset.value}
                className="flex items-center gap-2 rounded-lg border border-[#e9edeb] px-2.5 py-1.5 text-[11px] font-medium text-[#52615b] transition hover:bg-[#f7faf8] aria-pressed:border-brand-700"
              >
                <span
                  aria-hidden="true"
                  className="size-3.5 rounded-full"
                  style={{ backgroundColor: preset.value }}
                />
                {preset.label}
              </button>
            ))}
          </div>

          <p className="mt-6 text-xs font-semibold text-[#40504a]">Logo bisnis</p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <input
              ref={fileRef}
              id="logo-file"
              type="file"
              accept={LOGO_TYPES.join(",")}
              onChange={(event) => pickFile(event.target.files?.[0])}
              className="sr-only"
            />
            <label
              htmlFor="logo-file"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#e1e7e4] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#40504a] transition hover:bg-[#f7faf8]"
            >
              <Upload className="size-4" /> Pilih berkas
            </label>
            {(previewSrc || pendingLogo || removeLogo) && (
              <button
                type="button"
                onClick={() => {
                  setPendingLogo(null);
                  setRemoveLogo(true);
                  if (fileRef.current) fileRef.current.value = "";
                  setSaved("");
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-[#e9edeb] px-3.5 py-2.5 text-xs font-semibold text-[#7a4b45] transition hover:border-[#e0a99f] hover:bg-[#fdf4f2]"
              >
                <Trash2 className="size-4" /> Hapus logo
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-[#929e99]">
            PNG, JPEG, atau WebP. Maksimal {MAX_LOGO_BYTES / 1000} KB, disarankan bentuk persegi.
          </p>
        </div>

        <div className="rounded-2xl border border-dashed border-[#dfe6e3] bg-[#fafcfb] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#a1aca8]">
            Pratinjau
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span
              className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo is an inline data URL
                <img src={previewSrc} alt="Pratinjau logo" className="size-full object-contain" />
              ) : (
                <span className="text-lg font-black">a.</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#182321]">
                Nama bisnis Anda
              </span>
              <span className="block text-[11px] text-[#929e99]">Contoh tampilan header</span>
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Tombol utama
            </span>
            <span
              className="rounded-lg border px-3 py-1.5 text-[11px] font-semibold"
              style={{ borderColor: primaryColor, color: primaryColor }}
            >
              Tombol sekunder
            </span>
          </div>
          <div className="mt-3 flex items-start gap-2 text-[11px] leading-4 text-[#929e99]">
            <ImageIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>Logo tampil pada header dashboard dan halaman publik antrean.</span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy !== null || !hasChanges}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "save" && <LoaderCircle className="size-4 animate-spin" />}
          Simpan tampilan
        </button>
        <button
          type="button"
          onClick={() => void reset()}
          disabled={busy !== null}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e1e7e4] px-4 text-sm font-semibold text-[#52615b] transition hover:bg-[#f7faf8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "reset" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <RotateCcw className="size-4" />
          )}
          Kembalikan ke bawaan
        </button>
      </div>

      <div aria-live="polite" className="mt-4 space-y-2 empty:mt-0">
        {error && <InlineNotice message={error} />}
        {saved && <InlineNotice message={saved} variant="success" />}
      </div>
    </section>
  );
}
