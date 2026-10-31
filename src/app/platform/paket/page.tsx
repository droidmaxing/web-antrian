import { Package } from "lucide-react";
import { PlatformPlanForm } from "@/components/platform-plan-form";
import { PlatformTable, type PlatformRow } from "@/components/platform-table";
import { PlatformPageHeader, Section } from "@/components/platform-ui";
import { rupiah } from "@/modules/platform/console-format";
import { listPlatformPlans } from "@/modules/platform/platform-service";

export const metadata = { title: "Paket | Konsol Master Admin" };

export default async function PlatformPlansPage() {
  const plans = await listPlatformPlans();

  const rows: PlatformRow[] = plans.map((plan) => ({
    id: plan.id,
    cells: [
      { text: plan.name, strong: true, sub: plan.description ?? undefined },
      { text: plan.code, mono: true },
      { text: rupiah.format(plan.monthlyPrice) },
      { text: rupiah.format(plan.yearlyPrice) },
      { text: plan.active ? "Aktif" : "Nonaktif", tone: plan.active ? "ok" : "off" },
    ],
  }));

  return (
    <>
      <PlatformPageHeader
        eyebrow="Paket"
        title="Paket langganan"
        description="Harga tersimpan di database, jadi paket bisa berubah tanpa deployment. Harga 0 tidak bisa dibayar."
      />
      <Section icon={Package} title="Daftar paket" description={`${plans.length} paket tersedia.`}>
        <PlatformTable columns={["Paket", "Kode", "Bulanan", "Tahunan", "Status"]} rows={rows} unit="paket" empty="Belum ada paket." minWidth={560} />
      </Section>
      <Section icon={Package} title="Tambah paket" description="Kode paket dipakai di API dan tidak bisa sama dengan paket lain.">
        <PlatformPlanForm />
      </Section>
    </>
  );
}
