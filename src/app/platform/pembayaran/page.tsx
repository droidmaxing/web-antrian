import { ReceiptText } from "lucide-react";
import { PlatformTable, type PlatformRow } from "@/components/platform-table";
import { PlatformPageHeader, Section } from "@/components/platform-ui";
import { CYCLE_LABEL, PAYMENT_LABEL, dateLabel, paymentTone, rupiah } from "@/modules/platform/console-format";
import { listPlatformPayments } from "@/modules/platform/platform-service";

export const metadata = { title: "Pembayaran | Konsol Master Admin" };

export default async function PlatformPaymentsPage() {
  const payments = await listPlatformPayments({ page: 1, pageSize: 100 });

  const rows: PlatformRow[] = payments.items.map((payment) => ({
    id: payment.id,
    cells: [
      { text: payment.orderId, mono: true },
      { text: payment.business.name, strong: true, sub: payment.business.slug },
      { text: payment.plan?.name ?? "—" },
      { text: CYCLE_LABEL[payment.cycle] ?? payment.cycle },
      { text: rupiah.format(payment.amount) },
      { text: PAYMENT_LABEL[payment.status] ?? payment.status, tone: paymentTone(payment.status) },
      { text: dateLabel(payment.createdAt) },
      { text: dateLabel(payment.paidAt) },
    ],
  }));

  return (
    <>
      <PlatformPageHeader
        eyebrow="Pembayaran"
        title="Transaksi Midtrans"
        description="Nilai dan status hanya berubah setelah notifikasi Midtrans terverifikasi. Data ini hanya untuk penelusuran."
      />
      <Section
        icon={ReceiptText}
        title="Riwayat pembayaran"
        description={`${payments.total} transaksi, terbaru lebih dulu.`}
      >
        <PlatformTable
          columns={["Order", "Perusahaan", "Paket", "Periode", "Jumlah", "Status", "Dibuat", "Dibayar"]}
          rows={rows}
          unit="pembayaran"
          empty="Belum ada pembayaran."
          minWidth={880}
        />
      </Section>
    </>
  );
}
