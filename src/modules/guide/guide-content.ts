import type { FeatureKey, MembershipRole } from "@prisma/client";
import { can, type Capability } from "@/modules/tenancy/access";

/**
 * Content of the "Pelajari Sistem" tutorial. Steps carry the capability and
 * feature they depend on, so each role only reads what it can actually do and
 * no link points at a page the reader cannot open.
 */
export type GuideStep = {
  title: string;
  detail: string;
  /** Menu/pages to open, relative to the workspace. `${slug}` is replaced. */
  href?: string;
  hrefLabel?: string;
  requires?: Capability;
  feature?: FeatureKey;
};

export type GuideSection = {
  title: string;
  description: string;
  steps: GuideStep[];
};

const SECTIONS: GuideSection[] = [
  {
    title: "Mulai dari sini",
    description: "Langkah dasar yang berlaku untuk semua peran.",
    steps: [
      {
        title: "Masuk dan pilih cabang",
        detail:
          "Gunakan email dan kata sandi dari Owner. Nama cabang aktif ada di kiri atas; pilih cabang lain dari daftar itu bila Anda mengelola lebih dari satu cabang.",
        href: "/dashboard/${slug}",
        hrefLabel: "Buka dashboard",
      },
      {
        title: "Pantau ringkasan hari ini",
        detail:
          "Kartu Ringkasan menampilkan jumlah nomor yang menunggu, sedang dilayani, selesai, serta rata-rata waktu tunggu dan waktu layanan pada rentang waktu yang dipilih.",
        href: "/dashboard/${slug}#overview",
        hrefLabel: "Lihat ringkasan",
      },
      {
        title: "Layani antrean di loket",
        detail:
          "Bagian Antrean memuat semua nomor hari ini. Tekan Panggil berikutnya untuk memanggil nomor, lalu Mulai, Selesai, Lewati, atau Kembalikan ke antrean sesuai keadaan pelanggan.",
        href: "/dashboard/${slug}#queue",
        hrefLabel: "Buka antrean",
      },
      {
        title: "Ganti kata sandi sendiri",
        detail:
          "Tombol bergambar kunci di kanan atas (juga di bawah sidebar) membuka panel Ubah kata sandi. Isi kata sandi lama dan kata sandi baru minimal 8 karakter. Sesi login di perangkat lain tidak otomatis berakhir, jadi keluar manual bila perangkat itu bukan milik Anda.",
      },
      {
        title: "Cari antrean dan pelanggan",
        detail:
          "Di bagian Antrean, kotak pencarian bersama filter status dan loket menyaring nomor antrean hari ini. Membaca kolomnya saja: nama, kode layanan, atau nama loket. Untuk daftar kontak, buka Pelanggan dan pakai kotak pencarian di sana.",
        href: "/dashboard/${slug}#customers-manage",
        hrefLabel: "Buka pelanggan",
      },
    ],
  },
  {
    title: "Melayani booking",
    description: "Untuk bisnis yang mengaktifkan booking online.",
    steps: [
      {
        title: "Periksa booking hari ini",
        detail:
          "Bagian Booking memuat jadwal hari ini. Tandai pelanggan yang sudah hadir, dan nomor antrean akan masuk ke daftar tunggu loket.",
        href: "/dashboard/${slug}#bookings",
        hrefLabel: "Buka booking",
        feature: "BOOKING",
      },
    ],
  },
  {
    title: "Menyiapkan layanan dan loket",
    description: "Dilakukan saat bisnis mulai berjalan atau saat ada layanan baru.",
    steps: [
      {
        title: "Tambahkan layanan",
        detail:
          "Buat layanan beserta kode hurufnya (misalnya A, B). Kode ini menjadi awalan nomor antrean, jadi pakai kode yang singkat dan mudah dibaca.",
        href: "/dashboard/${slug}#services-manage",
        hrefLabel: "Kelola layanan",
        requires: "configureBusiness",
      },
      {
        title: "Siapkan loket",
        detail:
          "Tambahkan loket, lalu tentukan layanan mana yang dilayani loket tersebut. Loket hanya dapat memanggil nomor dari layanan yang ditugaskan.",
        href: "/dashboard/${slug}#counters-manage",
        hrefLabel: "Kelola loket",
        requires: "configureBusiness",
      },
      {
        title: "Atur cabang",
        detail:
          "Cabang memiliki jam operasional dan konfigurasi nomor sendiri. Buka Kelola cabang untuk menambah cabang atau memperbarui jam operasional.",
        href: "/dashboard/${slug}#branches",
        hrefLabel: "Kelola cabang",
        requires: "configureBusiness",
      },
      {
        title: "Pasang layar TV",
        detail:
          "Buat display, kaitkan dengan loket, lalu buka tautan yang muncul di perangkat TV. Tautan itu bersifat publik dan hanya menampilkan panggilan antrean.",
        href: "/dashboard/${slug}#displays-manage",
        hrefLabel: "Kelola layar TV",
        requires: "configureBusiness",
        feature: "TV_DISPLAY",
      },
    ],
  },
  {
    title: "Mengatur tim dan akses",
    description: "Owner dan Super Admin.",
    steps: [
      {
        title: "Tambahkan anggota tim",
        detail:
          "Undang rekan kerja dengan role Admin Operasional untuk petugas loket, atau Super Admin bila ia juga mengatur layanan dan tampilan.",
        href: "/dashboard/${slug}#team",
        hrefLabel: "Buka tim & akses",
        requires: "manageTeam",
      },
      {
        title: "Batasi cakupan kerja",
        detail:
          "Anggota tim bisa dibatasi ke cabang atau loket tertentu. Pembatasan ini berlaku di dashboard maupun di halaman publik, sehingga nomor yang tampil hanya yang relevan baginya.",
        requires: "manageTeam",
      },
    ],
  },
  {
    title: "Membaca laporan",
    description: "Rekap kinerja antrean dan produktivitas loket.",
    steps: [
      {
        title: "Pilih rentang tanggal",
        detail:
          "Bagian Laporan menghitung ulang rekap sesuai rentang tanggal yang Anda pilih, termasuk jam tersibuk dan rata-rata waktu layanan tiap loket.",
        href: "/dashboard/${slug}#reports",
        hrefLabel: "Buka laporan",
        requires: "viewReports",
      },
      {
        title: "Unduh sebagai CSV",
        detail:
          "Tombol Unduh CSV menyimpan rekap harian untuk dibuka di aplikasi spreadsheet.",
        requires: "viewReports",
      },
    ],
  },
  {
    title: "Menyesuaikan tampilan",
    description: "Judul, warna, dan logo workspace.",
    steps: [
      {
        title: "Ubah judul, warna, dan logo",
        detail:
          "Halaman Pengaturan menyimpan judul aplikasi, warna utama, dan logo bisnis. Judul dipakai sebagai nama tab browser, sedangkan warna dan logo dipakai konsisten di dashboard, halaman QR, dan halaman booking.",
        href: "/dashboard/${slug}/pengaturan",
        hrefLabel: "Buka pengaturan",
        requires: "manageTheme",
      },
      {
        title: "Aktifkan atau matikan fitur",
        detail:
          "Di halaman yang sama, fitur seperti booking, layar TV, voice call, dan analytics dapat dinyalakan atau dimatikan sesuai kebutuhan bisnis.",
        href: "/dashboard/${slug}/pengaturan",
        hrefLabel: "Kelola fitur",
        requires: "configureBusiness",
      },
    ],
  },
  {
    title: "Langganan dan pembayaran",
    description: "Milik pemilik bisnis: paket, masa aktif, dan riwayat pembayaran.",
    steps: [
      {
        title: "Pilih paket dan bayar",
        detail:
          "Halaman Langganan memuat paket yang tersedia, masa aktif berjalan, dan tombol bayar. Pembayaran diproses Midtrans; masa aktif bertambah hanya setelah notifikasi pembayaran terverifikasi.",
        href: "/dashboard/${slug}/langganan",
        hrefLabel: "Buka langganan",
        requires: "manageBilling",
      },
      {
        title: "Perbarui status pembayaran",
        detail:
          "Bila notifikasi Midtrans belum sampai, tombol Perbarui status menanyakan langsung keadaan transaksi ke Midtrans, jadi halaman ini tidak perlu menunggu.",
        requires: "manageBilling",
      },
      {
        title: "Baca riwayat pembayaran",
        detail:
          "Tabel di halaman yang sama mencatat tiap pembayaran: Menunggu, Dibayar, Kedaluwarsa, atau \"Dana dikembalikan\" bila Midtrans mengembalikan dananya. Saat fitur pembayaran dimatikan, tombol bayar disembunyikan dan checkout baru ditolak.",
        requires: "manageBilling",
      },
    ],
  },
  {
    title: "Membagikan akses ke pelanggan",
    description: "Halaman publik yang bisa dibuka pelanggan tanpa akun.",
    steps: [
      {
        title: "Bagikan tautan QR dan booking",
        detail:
          "Cetak atau bagikan QR yang tersedia di halaman Pengaturan. Setiap tautan hanya berlaku untuk satu cabang dan satu layanan, dan dapat dicabut kapan saja.",
        href: "/dashboard/${slug}/pengaturan",
        hrefLabel: "Lihat tautan publik",
        requires: "configureBusiness",
      },
    ],
  },
];

export function guideSections(input: {
  role: MembershipRole;
  enabledFeatures: FeatureKey[];
}): GuideSection[] {
  return SECTIONS.map((section) => ({
    ...section,
    steps: section.steps.filter(
      (step) =>
        (!step.requires || can(input.role, step.requires)) &&
        (!step.feature || input.enabledFeatures.includes(step.feature)),
    ),
  })).filter((section) => section.steps.length > 0);
}

export function guideHref(href: string, businessSlug: string): string {
  return href.replace("${slug}", encodeURIComponent(businessSlug));
}
