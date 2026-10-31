"use client";

import { useState } from "react";
import { RotateCcw, PackageOpen, LoaderCircle } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

interface Business {
  id: string;
  name: string;
  slug: string;
}

interface Plan {
  id: string;
  code: string;
  name: string;
}

export function PlatformSubscriptionManager({
  businesses,
  plans,
}: {
  businesses: Business[];
  plans: Plan[];
}) {
  const [selectedBusinessReset, setSelectedBusinessReset] = useState<string>("");
  const [selectedBusinessAssign, setSelectedBusinessAssign] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState<"reset" | "assign" | null>(null);
  const [resetError, setResetError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [assignError, setAssignError] = useState("");
  const [assignMessage, setAssignMessage] = useState("");

  const inputClass =
    "mt-1 h-9 w-full bubble-field px-2.5 text-xs text-[#344440] outline-none";

  const handleResetTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetMessage("");

    if (!selectedBusinessReset) {
      setResetError("Pilih workspace terlebih dahulu.");
      return;
    }

    setLoading("reset");
    try {
      const res = await fetch(
        `/api/v1/platform/subscriptions/${selectedBusinessReset}/trial-reset`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => null)) as
        | { error?: { message?: string }; data?: { trialEndsAt?: string } }
        | null;

      if (!res.ok) {
        throw new Error(data?.error?.message || "Gagal reset trial.");
      }

      setResetMessage(
        `Trial reset berhasil. Langganan kembali ke status trial hingga ${
          new Date(data?.data?.trialEndsAt || "").toLocaleDateString("id-ID") || "30 hari ke depan"
        }`
      );
      setSelectedBusinessReset("");
    } catch (cause) {
      setResetError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
    } finally {
      setLoading(null);
    }
  };

  const handleAssignPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignError("");
    setAssignMessage("");

    if (!selectedBusinessAssign) {
      setAssignError("Pilih workspace terlebih dahulu.");
      return;
    }

    setLoading("assign");
    try {
      const res = await fetch(
        `/api/v1/platform/subscriptions/${selectedBusinessAssign}/assign-plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: selectedPlan || null }),
        }
      );
      const data = (await res.json().catch(() => null)) as
        | { error?: { message?: string }; data?: { plan?: { name?: string } } }
        | null;

      if (!res.ok) {
        throw new Error(data?.error?.message || "Gagal assign plan.");
      }

      const planName = data?.data?.plan?.name || "Tanpa paket";
      setAssignMessage(`Paket berhasil diatur ke: ${planName}`);
      setSelectedBusinessAssign("");
      setSelectedPlan(null);
    } catch (cause) {
      setAssignError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Trial Reset */}
      <form onSubmit={handleResetTrial} className="bubble-card p-5 md:p-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <RotateCcw className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[#182321]">Reset Trial 30 Hari</h3>
            <p className="mt-0.5 text-[11px] leading-5 text-[#5c6a65]">
              Atur ulang periode trial langganan menjadi 30 hari ke depan. Status langganan akan berubah ke TRIAL.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <label className="block text-[11px] font-semibold text-[#52615b]">
            Pilih workspace
            <select
              value={selectedBusinessReset}
              onChange={(e) => setSelectedBusinessReset(e.target.value)}
              className={inputClass}
            >
              <option value="">— Pilih workspace —</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.slug})
                </option>
              ))}
            </select>
          </label>
          {resetError && <InlineNotice message={resetError} />}
          {resetMessage && <InlineNotice message={resetMessage} variant="success" />}
          <button
            type="submit"
            disabled={!selectedBusinessReset || loading === "reset"}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:cursor-progress disabled:opacity-60"
          >
            {loading === "reset" && <LoaderCircle className="size-3.5 animate-spin" />}
            Reset Trial
          </button>
        </div>
      </form>

      {/* Plan Assignment */}
      <form onSubmit={handleAssignPlan} className="bubble-card p-5 md:p-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <PackageOpen className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[#182321]">Atur Paket Langganan</h3>
            <p className="mt-0.5 text-[11px] leading-5 text-[#5c6a65]">
              Tetapkan atau lepas paket langganan tanpa memerlukan proses pembayaran.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[11px] font-semibold text-[#52615b]">
            Pilih workspace
            <select
              value={selectedBusinessAssign}
              onChange={(e) => setSelectedBusinessAssign(e.target.value)}
              className={inputClass}
            >
              <option value="">— Pilih workspace —</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.slug})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-semibold text-[#52615b]">
            Pilih paket
            <select
              value={selectedPlan || ""}
              onChange={(e) => setSelectedPlan(e.target.value || null)}
              className={inputClass}
            >
              <option value="">— Lepas Paket —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </label>
        </div>
        {assignError && <InlineNotice message={assignError} className="mt-3" />}
        {assignMessage && <InlineNotice message={assignMessage} variant="success" className="mt-3" />}
        <button
          type="submit"
          disabled={!selectedBusinessAssign || loading === "assign"}
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:cursor-progress disabled:opacity-60"
        >
          {loading === "assign" && <LoaderCircle className="size-3.5 animate-spin" />}
          Atur Paket
        </button>
      </form>
    </div>
  );
}
