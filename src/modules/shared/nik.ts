/** NIK = 16 digit angka tanpa pemisah. */
const NIK_PATTERN = /^\d{16}$/;

/**
 * Validasi bentuk saja (panjang & angka). Tidak ada layanan Dukcapil di sini;
 * tujuannya menolak data asal-asalan saat fitur NIK diaktifkan instansi.
 */
export function isValidNik(value: string) {
  return NIK_PATTERN.test(value.trim());
}
