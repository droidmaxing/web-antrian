"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, LoaderCircle, RefreshCw } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import type { SubscriptionView } from "@/modules/billing/subscription-service";

type PlanOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
};

type PaymentRow = {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  cycle: string;
  createdAt: string;
  paidAt: string | null;
  planName: string | null;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const tanggal = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const asDate = (value: string | null) => (value ? tanggal.format(new Date(value)) : "—");

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  PAID: "Dibayar",
  EXPIRED: "Kedaluwarsa",
  FAILED: "Gagal",
};

/**
 * Owner-facing billing: pick a plan and period, then hand off to Midtrans Snap.
 * Nothing here decides access — the webhook does, and this page only reflects
 * what the server already stored.
 */
export function SubscriptionBilling({
  businessSlug,
  subscription,
  plans,
  payments,
}: {
  businessSlug: string;
  subscription: SubscriptionView | null;
  plans: PlanOption[];
  payments: PaymentRow[];
}) {
  const router = useRouter();
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">(subscription?.cycle ?? "MONTHLY");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const selected = plans.find((plan) => plan.id === planId) ?? null;
  const price = selected ? (cycle === "YEARLY" ? selected.yearlyPrice : selected.monthlyPrice) : 0;

  async function pay() {
    if (!planId) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/businesses/${businessSlug}/subscription/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, cycle }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string }; data?: { redirectUrl?: string } }
        | null;
      if (!response.ok) throw new Error(body?.error?.message ?? "Checkout gagal dimulai.");
      const redirectUrl = body?.data?.redirectUrl;
      if (!redirectUrl) {
        throw new Error("Midtrans tidak mengembalikan tautan pembayaran. Hubungi administrator.");
      }
      window.location.assign(redirectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
      setPending(false);
    }
  }

  const endsAt = subscription?.currentPeriodEnd ?? subscription?.trialEndsAt ?? null;

  return (
    <div className="grid gap-5">
      <section className="bubble-card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-brand-700">
              Status langganan
            </p>
            <h2 className="mt-1.5 text-xl font-semibold tracking-[-.02em]">
              {subscription?.label ?? "Belum berlangganan"}
            </h2>
            <p className="mt-1.5 text-xs leading-5 text-[#53615b]">
              {subscription?.plan ? `Paket ${subscription.plan.name} · ` : ""}
              {subscription?.cycle === "YEARLY" ? "periode tahunan" : "periode bulanan"}
              {endsAt ? ` · berlaku sampai ${asDate(endsAt)}` : ""}
            </p>
            {!subscription?.allowed && (
              <p className="mt-2 text-xs leading-5 text-[#a5463d]">
                Akses operasional workspace dibatasi sampai langganan diperpanjang. Data dan
                pengaturan tetap tersimpan.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg bubble-panel px-3 py-2 text-[11px] font-semibold text-[#41524c] transition hover:bg-brand-50"
          >
            <RefreshCw className="size-3.5" /> Perbarui status
          </button>
        </div>
      </section>

      <section className="bubble-card p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Pilih paket</h2>
            <p className="mt-0.5 text-[11px] text-[#5c6a65]">
              Pembayaran diproses Midtrans. Status aktif setelah pembayaran terverifikasi.
            </p>
          </div>
          <div className="flex rounded-lg bubble-panel p-0.5">
            {(["MONTHLY", "YEARLY"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCycle(option)}
                aria-pressed={cycle === option}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                  cycle === option ? "bg-brand-700 text-white" : "text-[#52615b] hover:bg-brand-50"
                }`}
              >
                {option === "MONTHLY" ? "Bulanan" : "Tahunan"}
              </button>
            ))}
          </div>
        </div>

        {plans.length === 0 ? (
          <p className="mt-4 text-xs text-[#53615b]">
            Belum ada paket aktif. Hubungi administrator platform untuk mengaktifkan paket.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const amount = cycle === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice;
              const active = plan.id === planId;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setPlanId(plan.id)}
                  aria-pressed={active}
                  className={`rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-brand-700 bg-brand-50 shadow-bubble"
                      : "border-brand-200 hover:border-brand-200 hover:bg-brand-50"
                  }`}
                >
                  <span className="block text-sm font-semibold text-[#182321]">{plan.name}</span>
                  {plan.description && (
                    <span className="mt-1 block text-[11px] leading-5 text-[#5c6a65]">
                      {plan.description}
                    </span>
                  )}
                  <span className="mt-3 block text-base font-semibold tracking-[-.02em]">
                    {rupiah.format(amount)}
                    <span className="text-[11px] font-normal text-[#5c6a65]">
                      {cycle === "YEARLY" ? " / tahun" : " / bulan"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-brand-100 pt-4">
          <button
            type="button"
            onClick={() => void pay()}
            disabled={pending || !planId || price <= 0}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending && <LoaderCircle className="size-3.5 animate-spin" />}
            Lanjutkan pembayaran
            {selected && price > 0 ? ` · ${rupiah.format(price)}` : ""}
          </button>
          {selected && price <= 0 && (
            <span className="text-[11px] text-[#8d713f]">
              Harga paket ini masih 0. Hubungi administrator platform.
            </span>
          )}
        </div>

        {error && <InlineNotice message={error} className="mt-4" />}
      </section>

      <section className="bubble-card p-5 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <CalendarClock className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Riwayat pembayaran</h2>
            <p className="mt-0.5 text-[11px] text-[#5c6a65]">20 transaksi terakhir.</p>
          </div>
        </div>
        {payments.length === 0 ? (
          <p className="text-xs text-[#53615b]">Belum ada transaksi untuk workspace ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-brand-100">
                <tr>
                  {["Order", "Paket", "Periode", "Jumlah", "Status", "Dibuat", "Dibayar"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[.12em] text-[#606765]"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-[#f4f6f5] last:border-0">
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#687570]">
                      {payment.orderId}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-brand-800">
                      {payment.planName ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-brand-800">
                      {payment.cycle === "YEARLY" ? "Tahunan" : "Bulanan"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-brand-800">
                      {rupiah.format(payment.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-brand-800">
                      {PAYMENT_LABEL[payment.status] ?? payment.status}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-brand-800">
                      {asDate(payment.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-brand-800">
                      {asDate(payment.paidAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
