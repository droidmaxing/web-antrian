"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Download, LoaderCircle, TrendingUp } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

type ReportSummary = {
  range: { from: string; to: string };
  totals: {
    issued: number;
    completed: number;
    cancelled: number;
    noShow: number;
    skipped: number;
  };
  averages: { waitMinutes: number; serviceMinutes: number };
  completionRate: number;
  services: {
    serviceId: string;
    serviceName: string;
    serviceCode: string;
    issued: number;
    completed: number;
    averageWaitMinutes: number;
  }[];
  counters: {
    counterId: string;
    counterName: string;
    counterCode: string;
    served: number;
    averageServiceMinutes: number;
  }[];
  daily: { date: string; issued: number; completed: number; averageWaitMinutes: number }[];
  hourly: { hour: number; issued: number }[];
};

function isoDay(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function ReportsManager({
  businessSlug,
  branchId,
  canView,
}: {
  businessSlug: string;
  branchId: string;
  canView: boolean;
}) {
  const [from, setFrom] = useState(isoDay(-6));
  const [to, setTo] = useState(isoDay());
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/reports?branchId=${encodeURIComponent(
          branchId,
        )}&from=${from}&to=${to}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal memuat laporan.");
      setReport(result.data);
    } catch (error) {
      setReport(null);
      setNotice(error instanceof Error ? error.message : "Gagal memuat laporan.");
    } finally {
      setLoading(false);
    }
  }, [branchId, businessSlug, from, to]);

  useEffect(() => {
    let stopped = false;
    if (!canView) return;
    void (async () => {
      await Promise.resolve();
      if (!stopped) await load();
    })();
    return () => {
      stopped = true;
    };
  }, [canView, load]);

  function exportCsv() {
    if (!report) return;
    const rows = [
      ["Tanggal", "Nomor diterbitkan", "Selesai", "Rata-rata tunggu (menit)"],
      ...report.daily.map((day) => [
        day.date,
        String(day.issued),
        String(day.completed),
        String(day.averageWaitMinutes),
      ]),
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `laporan-antrean-${report.range.from}_${report.range.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!canView) {
    return (
      <section className="scroll-mt-28 bubble-card p-6">
        <h2 className="text-[15px] font-semibold tracking-[-.02em]">Laporan</h2>
        <p className="mt-2 text-xs leading-5 text-[#66736e]">
          Laporan performa hanya tersedia untuk Owner dan Super Admin.
        </p>
      </section>
    );
  }

  const peak = report?.hourly.reduce((best, slot) => (slot.issued > best.issued ? slot : best), {
    hour: 0,
    issued: 0,
  });

  return (
    <section
      id="reports"
      className="scroll-mt-28 bubble-card p-5 shadow-bubble-sm md:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-.02em]">Laporan performa</h2>
          <p className="mt-1 text-xs text-[#66736e]">
            Rekap antrean, waktu tunggu, dan produktivitas loket.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-medium text-[#53615b]">
            Dari
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block h-9 rounded-lg bubble-panel px-2.5 text-xs text-[#344440]"
            />
          </label>
          <label className="text-[11px] font-medium text-[#53615b]">
            Sampai
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block h-9 rounded-lg bubble-panel px-2.5 text-xs text-[#344440]"
            />
          </label>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex h-9 items-center gap-2 rounded-full bg-brand-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <CalendarRange className="size-3.5" />}
            Terapkan
          </button>
          <button
            onClick={exportCsv}
            disabled={!report}
            className="flex h-9 items-center gap-2 rounded-lg bubble-btn px-3 text-xs font-medium text-[#687570] disabled:opacity-40"
          >
            <Download className="size-3.5" /> CSV
          </button>
        </div>
      </div>

      {notice && <InlineNotice message={notice} className="mt-4" />}

      {report && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Nomor diterbitkan", value: report.totals.issued },
              { label: "Selesai dilayani", value: report.totals.completed },
              { label: "Rata-rata tunggu", value: `${report.averages.waitMinutes} mnt` },
              { label: "Rata-rata layanan", value: `${report.averages.serviceMinutes} mnt` },
            ].map((metric) => (
              <div key={metric.label} className="bubble-panel p-4">
                <p className="text-[11px] text-[#66736e]">{metric.label}</p>
                <p className="mt-1.5 text-xl font-semibold tracking-[-.03em]">{metric.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="bubble-panel p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#344440]">Antrean per hari</p>
                <span className="flex items-center gap-1 text-[11px] text-brand-600">
                  <TrendingUp className="size-3" />
                  {report.completionRate}% selesai
                </span>
              </div>
              <div className="mt-4 flex h-32 items-end gap-1.5">
                {report.daily.map((day) => {
                  const max = Math.max(...report.daily.map((entry) => entry.issued), 1);
                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                      <div
                        title={`${day.issued} antrean`}
                        className="w-full rounded-t bg-brand-400"
                        style={{ height: `${Math.max(4, (day.issued / max) * 100)}%` }}
                      />
                      <span className="text-[8px] text-[#5d6b67]">{day.date.slice(5)}</span>
                    </div>
                  );
                })}
                {!report.daily.length && (
                  <p className="text-[11px] text-[#5d6b67]">Tidak ada data pada rentang ini.</p>
                )}
              </div>
            </div>

            <div className="bubble-panel p-4">
              <p className="text-xs font-semibold text-[#344440]">Ringkasan status</p>
              <dl className="mt-3 space-y-2 text-[11px]">
                {[
                  ["Dibatalkan", report.totals.cancelled],
                  ["Dilewati", report.totals.skipped],
                  ["Tidak hadir", report.totals.noShow],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between">
                    <dt className="text-[#66736e]">{label}</dt>
                    <dd className="font-semibold text-[#46544f]">{value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-brand-100 pt-2">
                  <dt className="text-[#66736e]">Jam tersibuk</dt>
                  <dd className="font-semibold text-[#46544f]">
                    {peak?.issued ? `${String(peak.hour).padStart(2, "0")}:00` : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden bubble-panel">
              <p className="border-b border-brand-100 bg-brand-50 px-4 py-2.5 text-[11px] font-semibold text-[#46544f]">
                Per layanan
              </p>
              <div className="divide-y divide-[#f4f6f5]">
                {report.services.map((service) => (
                  <div key={service.serviceId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="font-mono text-[9px] font-bold text-brand-700">
                      {service.serviceCode}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[#46544f]">
                      {service.serviceName}
                    </span>
                    <span className="text-[11px] text-[#66736e]">
                      {service.issued} / {service.completed}
                    </span>
                    <span className="w-14 text-right text-[11px] text-[#687570]">
                      {service.averageWaitMinutes} mnt
                    </span>
                  </div>
                ))}
                {!report.services.length && (
                  <p className="px-4 py-5 text-center text-[11px] text-[#5d6b67]">
                    Belum ada antrean.
                  </p>
                )}
              </div>
            </div>

            <div className="overflow-hidden bubble-panel">
              <p className="border-b border-brand-100 bg-brand-50 px-4 py-2.5 text-[11px] font-semibold text-[#46544f]">
                Per loket
              </p>
              <div className="divide-y divide-[#f4f6f5]">
                {report.counters.map((counter) => (
                  <div key={counter.counterId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="font-mono text-[9px] font-bold text-brand-700">
                      {counter.counterCode}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[#46544f]">
                      {counter.counterName}
                    </span>
                    <span className="text-[11px] text-[#66736e]">{counter.served} dilayani</span>
                    <span className="w-14 text-right text-[11px] text-[#687570]">
                      {counter.averageServiceMinutes} mnt
                    </span>
                  </div>
                ))}
                {!report.counters.length && (
                  <p className="px-4 py-5 text-center text-[11px] text-[#5d6b67]">
                    Belum ada pelayanan selesai.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
