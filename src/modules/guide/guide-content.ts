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
        title: "Cari pelanggan",
        detail:
          "Gunakan kotak pencarian (atau tombol ⌘K) untuk menyaring nomor antrean berdasarkan nama pelanggan, kode layanan, atau nama loket.",
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
