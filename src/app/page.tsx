import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  Megaphone,
  MonitorPlay,
  QrCode,
  Smartphone,
  Users,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const FITUR = [
  {
    icon: QrCode,
    title: "Ambil nomor lewat QR",
    detail: "Cetak tautannya sekali. Pelanggan memindai dan menerima nomor antrean dari ponsel.",
  },
  {
    icon: CalendarClock,
    title: "Booking online",
    detail: "Pelanggan memilih tanggal dan jam, lalu mengambil nomor begitu tiba di lokasi.",
  },
  {
    icon: Megaphone,
    title: "Panggil dari loket",
    detail: "Petugas memanggil nomor berikutnya, lengkap dengan suara panggilan dan riwayatnya.",
  },
  {
    icon: MonitorPlay,
    title: "Layar TV ruang tunggu",
    detail: "Halaman display siap dibuka di TV ruang tunggu, tanpa aplikasi tambahan.",
  },
  {
    icon: Smartphone,
    title: "Status antrean di ponsel",
    detail: "Tautan status menunjukkan posisi antrean, jadi pelanggan tidak perlu berdiri menunggu.",
  },
  {
    icon: Users,
    title: "Cabang, tim, dan akses",
    detail: "Kelola beberapa cabang, batasi cakupan kerja petugas, dan atur hak aksesnya.",
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    const membership = await prisma.businessMembership.findFirst({
      where: { userId: session.user.id, business: { active: true } },
      orderBy: { createdAt: "asc" },
      select: { business: { select: { slug: true } } },
    });
    if (!membership) {
      // A Master Admin belongs to no business but still needs a landing page.
      const platformAdmin = await prisma.user.findFirst({
        where: { id: session.user.id, active: true, platformRole: "MASTER_ADMIN" },
        select: { id: true },
      });
      if (platformAdmin) redirect("/platform");
      redirect("/buat-workspace");
    }
    redirect(`/dashboard/${membership.business.slug}`);
  }

  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: [{ monthlyPrice: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      monthlyPrice: true,
      yearlyPrice: true,
    },
  });

  return (
    <div className="bubble-flow min-h-screen text-[#182321]">
      <header className="sticky top-0 z-20 border-b border-transparent bg-white/85 shadow-bubble-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-3 text-lg font-semibold tracking-tight text-brand-900"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand-200 text-xl font-black text-brand-700">
              a.
            </span>
            antrian
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-[#5d6b67] sm:flex">
            <a href="#fitur" className="hover:text-brand-900">
              Fitur
            </a>
            <a href="#langganan" className="hover:text-brand-900">
              Langganan
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-full px-4 py-2.5 text-sm font-semibold text-brand-900 transition hover:bg-brand-100"
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-bubble-lift transition hover:bg-brand-800"
            >
              Mulai gratis
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate mx-auto grid max-w-6xl items-center gap-14 px-6 py-16 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
          <span aria-hidden className="bubble-blob -left-40 -top-16 -z-10 size-[26rem] opacity-70 max-lg:hidden" />
          <span
            aria-hidden
            className="bubble-blob right-2 top-32 -z-10 size-64 opacity-50 max-lg:hidden"
            style={{ animationDelay: "-7s, -3s" }}
          />
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent-100 px-3 py-1.5 text-sm font-medium text-accent-900">
              <span className="size-1.5 rounded-full bg-accent-700" />
              Manajemen antrean untuk klinik, layanan publik, dan ritel
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-[-0.04em] sm:text-5xl">
              Nomor antrean, pemanggilan, dan layar tunggu dalam satu sistem.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-[#5d6b67]">
              Pelanggan mengambil nomor dari QR atau booking online, petugas memanggil dari
              loket, dan layar TV menampilkan posisi antrean. Semua cabang dalam satu
              workspace.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-700 px-6 text-sm font-semibold text-white shadow-bubble-lift transition hover:bg-brand-800"
              >
                Mulai uji coba 30 hari
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-full bubble-btn bg-white px-6 text-sm font-semibold text-brand-900 transition hover:bg-brand-50"
              >
                Masuk ke akun
              </Link>
            </div>
            <p className="mt-5 text-sm text-[#53615b]">
              Workspace dan masa uji coba disiapkan otomatis, tanpa kartu kredit.
            </p>
          </div>

          <div className="rounded-bubble bubble-card bg-white p-3">
            <div className="rounded-xl bg-brand-900 px-7 py-8 text-white">
              <div className="flex items-center justify-between text-xs text-white/55">
                <span>Layar tunggu</span>
                <span>Klinik Sehat · Cabang Utama</span>
              </div>
              <p className="mt-8 text-xs font-medium text-brand-300">Nomor dipanggil</p>
              <div className="mt-2 flex items-end justify-between gap-4">
                <span className="text-6xl font-black tracking-[-0.06em]">A-014</span>
                <span className="rounded-full bg-accent-400 px-3 py-1 text-sm font-semibold text-brand-900">Loket 2</span>
              </div>
              <div className="mt-8 border-t border-white/10 pt-5">
                <p className="text-xs text-white/50">Menunggu</p>
                <div className="mt-3 flex gap-4 text-2xl font-semibold text-white/80">
                  <span>A-015</span>
                  <span>A-016</span>
                  <span>B-003</span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[1.25rem] bg-brand-50 px-5 py-4">
              <span className="flex items-center gap-3 text-sm font-medium text-brand-900">
                <QrCode className="size-4" />
                Ambil nomor dari ponsel
              </span>
              <span className="text-xs text-[#5d6b67]">Rata-rata tunggu 12 menit</span>
            </div>
          </div>
        </section>

        <section id="fitur" className="bg-brand-50">
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Yang bisa Anda kelola
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#5d6b67]">
              Satu workspace untuk seluruh layanan dan cabang, dengan hak akses yang bisa
              dibatasi per petugas.
            </p>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FITUR.map(({ icon: Icon, title, detail }) => (
                <article key={title} className="bubble-card p-6">
                  <span className="bubble-icon size-11">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-base font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5d6b67]">{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="langganan" className="bg-brand-900">
          <div className="mx-auto max-w-6xl px-6 py-16 text-white lg:py-20">
            <p className="text-sm font-medium text-brand-300">Langganan</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">
              Mulai gratis 30 hari, lalu lanjut bulanan atau tahunan.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/60">
              Setiap workspace baru mendapat masa uji coba penuh dengan semua fitur terbuka.
              Setelah itu paket aktif berlanjut lewat halaman langganan workspace.
            </p>

            {plans.length > 0 ? (
              <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => {
                  const hemat =
                    plan.monthlyPrice > 0 && plan.yearlyPrice > 0
                      ? Math.round((1 - plan.yearlyPrice / (plan.monthlyPrice * 12)) * 100)
                      : 0;
                  return (
                    <article
                      key={plan.id}
                      className="flex flex-col rounded-bubble bg-white p-6 text-[#182321] shadow-bubble-sm"
                    >
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {plan.description && (
                        <p className="mt-2 text-sm leading-6 text-[#5d6b67]">
                          {plan.description}
                        </p>
                      )}
                      <div className="mt-auto pt-6">
                        <p className="text-3xl font-semibold tracking-[-0.03em]">
                          {plan.monthlyPrice > 0 ? rupiah.format(plan.monthlyPrice) : "Gratis"}
                          <span className="text-sm font-normal text-[#5d6b67]"> /bulan</span>
                        </p>
                        {plan.yearlyPrice > 0 && (
                          <p className="mt-2 text-sm text-[#5d6b67]">
                            {rupiah.format(plan.yearlyPrice)} /tahun
                            {hemat > 0 && ` · hemat ${hemat}%`}
                          </p>
                        )}
                        <Link
                          href="/register"
                          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white transition hover:bg-brand-800"
                        >
                          Mulai uji coba 30 hari
                        </Link>
                        <p className="mt-3 text-xs text-[#53615b]">
                          Paket dipilih setelah masa uji coba selesai.
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-12 rounded-bubble border border-white/10 bg-white/[.06] p-8">
                <h3 className="text-lg font-semibold">Paket berlangganan sedang disiapkan</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
                  Selama masa uji coba, seluruh fitur terbuka tanpa batas. Paket bulanan dan
                  tahunan akan tampil di sini begitu platform menambahkannya.
                </p>
                <Link
                  href="/register"
                  className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-accent-400 px-6 text-sm font-semibold text-brand-900 transition hover:bg-white"
                >
                  Mulai uji coba 30 hari
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            )}

            <p className="mt-8 text-xs text-white/45">
              Harga dalam rupiah. Uji coba 30 hari berjalan otomatis sejak workspace dibuat.
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-white shadow-bubble-sm">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-[#53615b] sm:flex-row">
          <span>© 2026 Antrian</span>
          <span className="flex gap-6">
            <Link href="/login" className="hover:text-brand-900">
              Masuk
            </Link>
            <Link href="/register" className="hover:text-brand-900">
              Buat akun
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
