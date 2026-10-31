import Link from "next/link";
import { ArrowRight, Building2, CreditCard, KeyRound, Package, ReceiptText, Users2 } from "lucide-react";
import { PlatformPageHeader, Pill, Section } from "@/components/platform-ui";
import { midtransServerKeyStatus } from "@/modules/billing/midtrans-settings";
import { googleApiKeyStatus } from "@/modules/billing/google-settings";
import { googleLoginStatus } from "@/modules/platform/google-login";
import {
  listPlatformBusinesses,
  listPlatformPayments,
  listPlatformSubscriptions,
  listPlatformUsers,
} from "@/modules/platform/platform-service";

export const metadata = { title: "Ringkasan | Konsol Master Admin" };

/** Ringkasan hanya butuh jumlahnya, jadi tiap daftar diambil satu baris. */
const COUNT_ONLY = { page: 1, pageSize: 1 };

const PAGES = [
  { href: "/platform/perusahaan", label: "Perusahaan", description: "Suspend atau aktifkan workspace pelanggan.", icon: Building2 },
  { href: "/platform/paket", label: "Paket", description: "Harga dan ketersediaan paket langganan.", icon: Package },
  { href: "/platform/langganan", label: "Langganan", description: "Tukar paket, reset uji coba, perpanjang periode.", icon: CreditCard },
  { href: "/platform/pembayaran", label: "Pembayaran", description: "Riwayat transaksi Midtrans tiap workspace.", icon: ReceiptText },
  { href: "/platform/pengguna", label: "Pengguna", description: "Akun lintas perusahaan dan perannya.", icon: Users2 },
  { href: "/platform/integrasi", label: "Integrasi", description: "Kredensial Midtrans dan Google.", icon: KeyRound },
];

export default async function PlatformOverviewPage() {
  const [businesses, users, subscriptions, payments, midtrans, googleLogin, googleKey] = await Promise.all([
    listPlatformBusinesses(),
    listPlatformUsers(COUNT_ONLY),
    listPlatformSubscriptions(COUNT_ONLY),
    listPlatformPayments(COUNT_ONLY),
    midtransServerKeyStatus(),
    googleLoginStatus(),
    googleApiKeyStatus(),
  ]);

  const suspended = businesses.filter((business) => !business.active).length;
  const stats = [
    { label: "Perusahaan", value: businesses.length, sub: `${suspended} ditangguhkan`, icon: Building2 },
    { label: "Pengguna", value: users.total, sub: "lintas perusahaan", icon: Users2 },
    { label: "Langganan", value: subscriptions.total, sub: "seluruh status", icon: CreditCard },
    { label: "Pembayaran", value: payments.total, sub: "transaksi tercatat", icon: ReceiptText },
  ];

  const integrations = [
    {
      label: "Login dengan Google",
      detail: googleLogin.configured
        ? `${googleLogin.source === "website" ? "Website" : "Environment"} · ${googleLogin.enabled ? "aktif" : "nonaktif"}`
        : "Belum dikonfigurasi",
      tone: googleLogin.configured && googleLogin.enabled ? ("ok" as const) : ("off" as const),
    },
    {
      label: "Google API key",
      detail: googleKey.configured
        ? `${googleKey.source === "website" ? "Website" : "Environment"} · ${googleKey.enabled ? "aktif" : "nonaktif"}`
        : "Belum dikonfigurasi",
      tone: googleKey.configured && googleKey.enabled ? ("ok" as const) : ("off" as const),
    },
    {
      label: "Midtrans",
      detail: midtrans.configured ? `Server key dari ${midtrans.source === "website" ? "website" : "environment"}` : "Belum ada Server Key",
      tone: midtrans.configured ? ("ok" as const) : ("off" as const),
    },
  ];

  return (
    <>
      <PlatformPageHeader
        eyebrow="Platform"
        title="Ringkasan operasional"
        description="Semua data di konsol ini lintas perusahaan. Menangguhkan workspace menutup akses seluruh anggotanya tanpa menghapus data."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bubble-card px-4 py-3.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5c6a65]">
              <stat.icon className="size-3.5" aria-hidden /> {stat.label}
            </div>
            <p className="mt-1.5 text-2xl font-semibold tracking-[-.03em]">{stat.value}</p>
            <p className="text-[11px] text-[#5d6b67]">{stat.sub}</p>
          </div>
        ))}
      </div>

      <Section icon={Package} title="Kelola per fitur" description="Tiap bagian punya halamannya sendiri supaya tidak perlu menggulir satu halaman panjang.">
        <div className="grid gap-3 sm:grid-cols-2">
          {PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="group flex items-start gap-3 bubble-panel p-3 transition hover:bg-brand-50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <page.icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-xs font-semibold text-[#182321]">
                  {page.label}
                  <ArrowRight className="size-3 text-[#5d6b67] transition group-hover:translate-x-0.5" aria-hidden />
                </span>
                <span className="mt-0.5 block text-[11px] leading-5 text-[#5c6a65]">{page.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section icon={KeyRound} title="Status integrasi" description="Kredensial disimpan terenkripsi di database; environment hanya cadangan.">
        <ul className="grid gap-2">
          {integrations.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-3 bubble-panel px-3 py-2.5">
              <span className="text-xs font-semibold text-[#344440]">{item.label}</span>
              <span className="flex items-center gap-2 text-[11px] text-[#5c6a65]">
                {item.detail}
                <Pill label={item.tone === "ok" ? "Aktif" : "Nonaktif"} tone={item.tone} />
              </span>
            </li>
          ))}
        </ul>
        <Link href="/platform/integrasi" className="mt-3 inline-flex text-[11px] font-semibold text-brand-700 hover:underline">
          Buka pengaturan integrasi
        </Link>
      </Section>
    </>
  );
}
