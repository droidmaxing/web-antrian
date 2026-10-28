/**
 * Hitungan halaman kini tinggal di src/modules/shared/pagination.ts supaya
 * dipakai semua daftar. Berkas ini meneruskan nama lama agar importer pelanggan
 * (service, komponen, test) tidak perlu diubah.
 */
export {
  PAGE_SIZES as CUSTOMER_PAGE_SIZES,
  resolvePage,
  type PageSize as CustomerPageSize,
  type Page as CustomerPage,
} from "@/modules/shared/pagination";
