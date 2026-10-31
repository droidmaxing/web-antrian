/**
 * Zona waktu cabang boleh kosong: cabang tanpa pengaturan sendiri mewarisi zona
 * usaha. Apa pun yang mencapai `Intl`/`toLocaleString` wajib mendapat zona yang
 * nyata, karena `null` langsung melempar `RangeError: Invalid time zone
 * specified` dan mematikan seluruh halaman (termasuk struk cetak antrean).
 */
export const DEFAULT_TIMEZONE = "Asia/Jakarta";

export function timezoneOr(value?: string | null): string {
  return value?.trim() || DEFAULT_TIMEZONE;
}

/**
 * Zona perangkat pengunjung. Jam di halaman publik (struk, status antrean,
 * booking) harus mengikuti lokasi user yang membukanya, bukan zona server atau
 * default usaha — hasil `Intl` baru bisa dipercaya di sisi klien.
 */
export function viewerTimeZone(fallback?: string | null): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || timezoneOr(fallback);
  } catch {
    return timezoneOr(fallback);
  }
}
