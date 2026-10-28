"use client";

import { useState } from "react";
import { Check, LoaderCircle, LockKeyhole, ToggleLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FeatureKey } from "@prisma/client";
import { InlineNotice } from "@/components/inline-notice";

const featureInfo: {
  key: FeatureKey;
  title: string;
  description: string;
}[] = [
  { key: "QR_QUEUE", title: "Antrean QR", description: "Pelanggan mengambil nomor antrean tanpa login." },
  { key: "BOOKING", title: "Booking online", description: "Jadwal layanan dapat dipesan secara online." },
  { key: "WHATSAPP", title: "Notifikasi WhatsApp", description: "Kirim pembaruan antrean melalui WhatsApp." },
  { key: "TV_DISPLAY", title: "TV Display", description: "Tampilkan panggilan antrean di layar cabang." },
  { key: "VOICE_CALL", title: "Voice Call", description: "Bacakan nomor antrean saat dipanggil." },
  { key: "MULTI_COUNTER", title: "Multi Counter", description: "Layani antrean dari beberapa loket sekaligus." },
  { key: "ANALYTICS", title: "Analytics", description: "Laporan jam sibuk dan performa layanan." },
  { key: "ADVERTISEMENT", title: "Advertisement", description: "Materi promosi di layar display." },
  { key: "MULTI_BRANCH", title: "Multi Branch", description: "Kelola lebih dari satu cabang bisnis." },
];

export function FeatureSettings({
  businessSlug,
  enabledFeatures,
}: {
  businessSlug: string;
  enabledFeatures: FeatureKey[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(new Set(enabledFeatures));
  const [saving, setSaving] = useState<FeatureKey | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");

  async function toggle(key: FeatureKey) {
    const wasEnabled = enabled.has(key);
    const next = new Set(enabled);
    if (wasEnabled) next.delete(key);
    else next.add(key);
    setEnabled(next);
    setSaving(key);
    setNotice("");

    try {
      const response = await fetch(`/api/v1/businesses/${businessSlug}/features`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features: [{ featureKey: key, enabled: !wasEnabled }],
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message ?? "Pengaturan fitur gagal disimpan.");
      }
      setNotice("Pengaturan fitur tersimpan.");
      setNoticeVariant("success");
      router.refresh();
    } catch (error) {
      setEnabled((current) => {
        const rollback = new Set(current);
        if (wasEnabled) rollback.add(key);
        else rollback.delete(key);
        return rollback;
      });
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Terjadi kesalahan.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section id="settings" className="rounded-2xl border border-[#e9edeb] bg-white p-5 shadow-[0_2px_8px_rgba(25,48,40,.025)] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-[-.02em]">Pengaturan fitur</h2>
            <span className="flex items-center gap-1 rounded-full bg-[#eff5f2] px-2 py-1 text-[9px] font-medium text-[#397b68]">
              <LockKeyhole className="size-3" /> Super Admin
            </span>
          </div>
          <p className="mt-1 text-xs text-[#929e99]">
            Pilih kemampuan yang tersedia untuk bisnis ini.
          </p>
        </div>
        <ToggleLeft className="size-5 text-[#889590]" />
      </div>
      {notice && (
        <InlineNotice message={notice} variant={noticeVariant} className="mt-4" />
      )}
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {featureInfo.map((feature) => {
          const active = enabled.has(feature.key);
          return (
            <div
              key={feature.key}
              className="flex items-center gap-3 rounded-xl border border-[#eff2f0] p-3"
            >
              <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-brand-50 text-[#43886d]" : "bg-[#f3f5f4] text-[#98a39f]"}`}>
                {active ? <Check className="size-4" /> : <ToggleLeft className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#42504b]">{feature.title}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-[#98a39f]">
                  {feature.description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                aria-label={`${active ? "Nonaktifkan" : "Aktifkan"} ${feature.title}`}
                disabled={saving !== null}
                onClick={() => void toggle(feature.key)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${active ? "bg-brand-700" : "bg-[#dfe5e2]"}`}
              >
                {saving === feature.key ? (
                  <LoaderCircle className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
                ) : (
                  <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all ${active ? "left-[18px]" : "left-0.5"}`} />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
