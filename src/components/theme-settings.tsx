"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, LoaderCircle, Palette, RotateCcw, Trash2, Upload } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import {
  LOGO_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  brandVars,
  logoDataUrl,
  type BrandTheme,
} from "@/modules/tenancy/brand";

/** 300 KB on disk; the API caps the base64 payload at LOGO_MAX_LENGTH chars. */
const MAX_LOGO_BYTES = 300_000;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

const PRIMARY_PRESETS = [
  { label: "Hijau antrian", value: "#176b5b" },
  { label: "Biru laut", value: "#1d5f9c" },
  { label: "Ungu", value: "#5b4bb7" },
  { label: "Oranye", value: "#b8622a" },
  { label: "Merah", value: "#a83a4b" },
];

const SECONDARY_PRESETS = [
  { label: "Kuning madu", value: "#f2a93b" },
  { label: "Mint", value: "#4fc79c" },
  { label: "Langit", value: "#4aa3e0" },
  { label: "Lavender", value: "#9b7ce0" },
  { label: "Koral", value: "#f0716a" },
];

/** Static class strings: Tailwind only generates classes it can read literally. */
const BRAND_SWATCHES = [
  "bg-brand-50",
  "bg-brand-100",
  "bg-brand-200",
  "bg-brand-300",
  "bg-brand-400",
  "bg-brand-500",
  "bg-brand-600",
  "bg-brand-700",
  "bg-brand-800",
  "bg-brand-900",
];
const ACCENT_SWATCHES = [
  "bg-accent-50",
  "bg-accent-100",
  "bg-accent-200",
  "bg-accent-300",
  "bg-accent-400",
  "bg-accent-500",
  "bg-accent-600",
  "bg-accent-700",
  "bg-accent-800",
  "bg-accent-900",
];

/** Prefers the per-field message so an upload problem is stated precisely. */
function apiMessage(result: unknown, fallback: string) {
  const error = (result as { error?: { message?: string; fields?: Record<string, string> } })
    ?.error;
  return (
    error?.fields?.logo ??
    error?.fields?.title ??
    error?.fields?.primaryColor ??
    error?.fields?.secondaryColor ??
    error?.message ??
    fallback
  );
}

/**
 * Colour picker + preset row. The hex field is free text so a customer can paste
 * their exact brand code; the API validates before anything is stored.
 */
function ColorField({
  id,
  label,
  hint,
  value,
  presets,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  presets: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-6">
      <label htmlFor={id} className="block text-xs font-semibold text-brand-800">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2.5">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="size-11 cursor-pointer bubble-card bg-white p-1"
        />
        <input
          type="text"
          inputMode="text"
          aria-label={`Kode heksadesimal ${label.toLowerCase()}`}
          value={value}
          maxLength={7}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-32 rounded-xl bubble-field px-3 font-mono text-xs uppercase text-brand-900 outline-none"
        />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            aria-label={`Pakai warna ${preset.label}`}
            aria-pressed={value.toLowerCase() === preset.value}
            className="flex items-center gap-2 rounded-full bubble-btn px-2.5 py-1.5 text-[11px] font-medium text-brand-800 transition hover:bg-brand-50 aria-pressed:border-brand-700 aria-pressed:bg-brand-50"
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
    </div>
  );
}

/**
 * Super Admin workspace branding: two colours (primary + secondary) and a logo.
 * The preview renders the real palette, so what is shown is what gets saved.
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
  const [title, setTitle] = useState(initialTheme.title ?? "");
  const [primaryColor, setPrimaryColor] = useState(initialTheme.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initialTheme.secondaryColor);
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const previewSrc = removeLogo ? null : (pendingLogo ?? logoDataUrl(current));
  const colorChanged = primaryColor.toLowerCase() !== current.primaryColor.toLowerCase();
  const secondaryChanged =
    secondaryColor.toLowerCase() !== current.secondaryColor.toLowerCase();
  const titleChanged = title.trim() !== (current.title ?? "");
  const hasChanges =
    colorChanged || secondaryChanged || titleChanged || removeLogo || pendingLogo !== null;

  function applyTheme(theme: BrandTheme) {
    setCurrent(theme);
    setTitle(theme.title ?? "");
    setPrimaryColor(theme.primaryColor);
    setSecondaryColor(theme.secondaryColor);
    setPendingLogo(null);
    setRemoveLogo(false);
    if (fileRef.current) fileRef.current.value = "";
  }

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
      const body: {
        title?: string | null;
        primaryColor?: string;
        secondaryColor?: string;
        logo?: string | null;
      } = {};
      if (titleChanged) body.title = title.trim() || null;
      if (colorChanged) body.primaryColor = primaryColor;
      if (secondaryChanged) body.secondaryColor = secondaryColor;
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
      applyTheme(result.data as BrandTheme);
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
      applyTheme(result.data as BrandTheme);
      setSaved("Judul, warna, dan logo dikembalikan ke tampilan standar.");
      router.refresh();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Terjadi kesalahan.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="bubble-card p-5 md:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <Palette className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-.02em]">Judul, warna, dan logo</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Hanya Super Admin. Warna utama dan warna sekunder berlaku di dashboard, halaman QR,
            booking, dan layar TV.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <label htmlFor="app-title" className="text-xs font-semibold text-brand-800">
            Judul aplikasi
          </label>
          <input
            id="app-title"
            type="text"
            value={title}
            maxLength={TITLE_MAX_LENGTH}
            placeholder="Nama bisnis Anda"
            onChange={(event) => {
              setTitle(event.target.value);
              setSaved("");
            }}
            className="mt-2 h-11 w-full max-w-xs rounded-xl bubble-field px-3 text-sm text-brand-900 outline-none"
          />
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            Muncul sebagai judul tab browser. Kosongkan untuk memakai nama bisnis.
          </p>

          <ColorField
            id="primary-color"
            label="Warna utama"
            hint="Tombol, navigasi, dan header. Semua gradasi warna diturunkan dari sini."
            value={primaryColor}
            presets={PRIMARY_PRESETS}
            onChange={(value) => {
              setPrimaryColor(value);
              setSaved("");
            }}
          />

          <ColorField
            id="secondary-color"
            label="Warna sekunder"
            hint="Aksen: lencana, sorotan, dan sentuhan playful di kartu serta halaman publik."
            value={secondaryColor}
            presets={SECONDARY_PRESETS}
            onChange={(value) => {
              setSecondaryColor(value);
              setSaved("");
            }}
          />

          <p className="mt-6 text-xs font-semibold text-brand-800">Logo bisnis</p>
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
              className="inline-flex cursor-pointer items-center gap-2 bubble-card bg-white px-3.5 py-2.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-50"
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
                className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#7a4b45] transition hover:bg-[#fdf4f2] bubble-btn"
              >
                <Trash2 className="size-4" /> Hapus logo
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            PNG, JPEG, atau WebP. Maksimal {MAX_LOGO_BYTES / 1000} KB, disarankan bentuk persegi.
          </p>
        </div>

        {/* Colours are dragged in as CSS variables, so the preview uses the very
            same utilities the app renders with. */}
        <div
          style={brandVars({ primaryColor, secondaryColor })}
          className="rounded-bubble bg-brand-50 p-4 bubble-panel"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
            Pratinjau
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-brand-700 text-white shadow-bubble-lift">
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo is an inline data URL
                <img src={previewSrc} alt="Pratinjau logo" className="size-full object-contain" />
              ) : (
                <span className="text-lg font-black">a.</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-brand-900">
                {title.trim() || "Nama bisnis Anda"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Judul tab browser dan header
              </span>
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-700 px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-bubble-lift">
              Tombol utama
            </span>
            <span className="rounded-full bg-brand-50 px-3.5 py-1.5 text-[11px] font-semibold text-brand-700 shadow-bubble-sm">
              Tombol utama (lembut)
            </span>
            <span className="bubble-chip px-3.5 py-1.5 text-[11px] font-semibold">
              Aksen sekunder
            </span>
          </div>
          <div className="mt-4 grid grid-cols-10 gap-1">
            {BRAND_SWATCHES.map((swatch) => (
              <span key={swatch} title={swatch} className={`h-6 rounded-full ${swatch}`} />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-10 gap-1">
            {ACCENT_SWATCHES.map((swatch) => (
              <span key={swatch} title={swatch} className={`h-6 rounded-full ${swatch}`} />
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 text-[11px] leading-4 text-muted-foreground">
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
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white shadow-bubble-lift transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {busy === "save" && <LoaderCircle className="size-4 animate-spin" />}
          Simpan tampilan
        </button>
        <button
          type="button"
          onClick={() => void reset()}
          disabled={busy !== null}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bubble-btn px-4 text-sm font-semibold text-brand-800 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
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
