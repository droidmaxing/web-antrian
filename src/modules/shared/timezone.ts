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
 * Zona hanya berguna kalau `Intl` mengenalinya; nama yang salah (mis. "Mars/Olympus")
 * membuat setiap `Intl.DateTimeFormat` melempar RangeError, dan karena dipakai di
 * alur antrean/booking, seluruh halaman pelanggan cabang itu jadi 500. Jadi tolak
 * di pintu masuk, jangan simpan ke DB.
 */
export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
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
