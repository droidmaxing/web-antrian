import { CreditCard, Package } from "lucide-react";
import { PlatformSubscriptionManager } from "@/components/platform-subscription-manager";
import { PlatformTable, type PlatformRow } from "@/components/platform-table";
import { PlatformPageHeader, Section } from "@/components/platform-ui";
import { CYCLE_LABEL, dateLabel, periodEnd, subscriptionTone } from "@/modules/platform/console-format";
import { subscriptionLabel } from "@/modules/billing/subscription-service";
import { listPlatformBusinesses, listPlatformPlans, listPlatformSubscriptions } from "@/modules/platform/platform-service";

export const metadata = { title: "Langganan | Konsol Master Admin" };

export default async function PlatformSubscriptionsPage() {
  const [subscriptions, businesses, plans] = await Promise.all([
    listPlatformSubscriptions({ page: 1, pageSize: 100 }),
    listPlatformBusinesses(),
    listPlatformPlans(),
  ]);

  const rows: PlatformRow[] = subscriptions.items.map((subscription) => {
    const endsAt = periodEnd(subscription);
    return {
      id: subscription.id,
      cells: [
        { text: subscription.business.name, strong: true, sub: subscription.business.slug },
        { text: subscription.plan?.name ?? "—" },
        { text: CYCLE_LABEL[subscription.cycle] ?? subscription.cycle },
        { text: subscriptionLabel(subscription.status, endsAt), tone: subscriptionTone(subscription.status) },
        { text: dateLabel(endsAt) },
        { text: dateLabel(subscription.updatedAt) },
      ],
    };
  });

  return (
    <>
      <PlatformPageHeader
        eyebrow="Langganan"
        title="Langganan workspace"
        description="Perubahan di sini berlaku langsung: tukar paket, reset masa uji coba, atau perpanjang periode berjalan."
      />
      <Section
        icon={CreditCard}
        title="Daftar langganan"
        description={`${subscriptions.total} langganan, terbaru diperbarui lebih dulu.`}
      >
        <PlatformTable
          columns={["Perusahaan", "Paket", "Periode", "Status", "Akhir periode", "Diperbarui"]}
          rows={rows}
          unit="langganan"
          empty="Belum ada langganan."
        />
      </Section>
      <Section
        icon={Package}
        title="Ubah langganan"
        description="Reset uji coba mengembalikan status ke TRIAL 30 hari; perpanjangan menambah bulan ke periode berjalan."
      >
        <PlatformSubscriptionManager businesses={businesses} plans={plans} />
      </Section>
    </>
  );
}
