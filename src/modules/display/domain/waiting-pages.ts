/**
 * Layar lobi pada hari ramai bisa punya puluhan pelanggan menunggu, sedangkan
 * satu baris kartu hanya terbaca nyaman sampai delapan nomor. Daftar menunggu
 * karena itu ditayangkan per halaman dan diputar bergiliran, bukan diperkecil
 * sampai nomornya tidak terbaca atau dipotong diam-diam.
 */
export const WAITING_PAGE_SIZE = 8;

/** Tiga halaman sekaligus: cukup untuk memutar daftar tanpa membebani query. */
export const WAITING_FETCH_LIMIT = WAITING_PAGE_SIZE * 3;

export function paginateWaiting<T>(items: T[], size = WAITING_PAGE_SIZE): T[][] {
  if (size < 1) return [items];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

/** Satu halaman berikutnya, berputar kembali ke awal setelah halaman terakhir. */
export function nextWaitingPage(page: number, totalPages: number): number {
  return totalPages > 1 ? (page + 1) % totalPages : 0;
}
