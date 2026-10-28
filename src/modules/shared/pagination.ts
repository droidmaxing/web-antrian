/**
 * Ukuran halaman yang boleh dipilih di daftar mana pun (pelanggan, layanan,
 * booking, ...). Satu-satunya tempat hitungan halaman: dipakai server
 * (skip/take) dan klien (jumlah halaman) supaya keduanya tidak pernah berbeda.
 */
export const PAGE_SIZES = [10, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type Page = {
  page: number;
  pageSize: number;
  pageCount: number;
  skip: number;
  take: number;
};

/**
 * Halaman di luar rentang dijepit ke halaman yang benar-benar ada, ukuran tak
 * dikenal kembali ke 10.
 */
export function resolvePage(total: number, pageSize: number, page: number): Page {
  const size = (PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : PAGE_SIZES[0];
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.trunc(total) : 0;
  const pageCount = Math.max(1, Math.ceil(safeTotal / size));
  const current = Math.min(Math.max(Math.trunc(page) || 1, 1), pageCount);
  return {
    page: current,
    pageSize: size,
    pageCount,
    skip: (current - 1) * size,
    take: size,
  };
}

/** Potong daftar yang sudah dimuat penuh ke satu halaman (paginasi sisi klien). */
export function paginate<T>(items: readonly T[], pageSize: number, page: number) {
  const resolved = resolvePage(items.length, pageSize, page);
  return {
    ...resolved,
    rows: items.slice(resolved.skip, resolved.skip + resolved.take),
  };
}
