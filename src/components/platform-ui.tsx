import type { LucideIcon } from "lucide-react";

/**
 * Bagian tampilan yang dipakai di beberapa halaman konsol. Tanpa "use client"
 * supaya halaman tetap server component — ikon Lucide diteruskan sebagai
 * komponen, yang tidak bisa melewati batas client component.
 */
export const TH = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[.12em] text-[#606765]";
export const TD = "px-3 py-2.5 align-top text-[11px] text-brand-800";

export type Tone = "ok" | "warn" | "off";

export function Pill({ label, tone = "off" }: { label: string; tone?: Tone }) {
  const styles = {
    ok: "border-brand-200 bg-brand-50 text-brand-600",
    warn: "border-accent-300 bg-accent-100 text-accent-900",
    off: "border-[#f2d9d5] bg-[#fff7f5] text-[#a5463d]",
  }[tone];
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles}`}>
      {label}
    </span>
  );
}

export function PlatformPageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-brand-700">{eyebrow}</p>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-[-.03em]">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#53615b]">{description}</p>
    </div>
  );
}

export function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bubble-card p-5 md:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#182321]">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-5 text-[#5c6a65]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
