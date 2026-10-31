import { Building2 } from "lucide-react";
import { PlatformTable, type PlatformRow } from "@/components/platform-table";
import { PlatformPageHeader, Section } from "@/components/platform-ui";
import { dateLabel, periodEnd, subscriptionTone } from "@/modules/platform/console-format";
import { subscriptionLabel } from "@/modules/billing/subscription-service";
import { listPlatformBusinesses } from "@/modules/platform/platform-service";

export const metadata = { title: "Perusahaan | Konsol Master Admin" };

export default async function PlatformBusinessesPage() {
  const businesses = await listPlatformBusinesses();

  const rows: PlatformRow[] = businesses.map((business) => {
    const subscription = business.subscription;
    const endsAt = subscription ? periodEnd(subscription) : null;
    return {
      id: business.id,
      cells: [
        {
          text: business.name,
          strong: true,
          sub: subscription?.plan ? `Paket ${subscription.plan.name}` : undefined,
        },
        { text: business.slug, mono: true },
        { text: String(business._count.memberships) },
        subscription
          ? {
              text: subscriptionLabel(subscription.status, endsAt),
              tone: subscriptionTone(subscription.status),
              sub: endsAt ? `s.d. ${dateLabel(endsAt)}` : undefined,
            }
          : { text: "Tanpa langganan", tone: "off" },
        { text: dateLabel(business.createdAt) },
      ],
      action: { businessId: business.id, active: business.active },
    };
  });

  return (
    <>
      <PlatformPageHeader
        eyebrow="Perusahaan"
        title="Workspace pelanggan"
        description="Suspend menutup akses seluruh anggota workspace tanpa menghapus data. Aktifkan kembali kapan saja."
      />
      <Section
        icon={Building2}
        title="Daftar perusahaan"
        description={`${businesses.length} workspace terdaftar, terbaru lebih dulu.`}
      >
        <PlatformTable
          columns={["Perusahaan", "Slug", "Anggota", "Langganan", "Dibuat"]}
          rows={rows}
          unit="perusahaan"
          empty="Belum ada perusahaan terdaftar."
        />
      </Section>
    </>
  );
}
