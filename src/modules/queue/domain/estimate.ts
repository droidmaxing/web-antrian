/**
 * Estimasi tunggu mengikuti urutan antrean: setiap orang di depan menambah
 * estimasi default layanan (`Service.averageMinutes`), plus buffer cabang.
 * Dihitung ulang tiap request, jadi angkanya turun sendiri saat antrean maju.
 */

const MIN_MINUTES = 1;
const MAX_MINUTES = 120;

export type EstimateInput = {
  /** Orang di depan: yang menunggu + yang sedang dipanggil/dilayani. */
  ahead: number;
  /** Estimasi default per antrean (menit) — biasanya Service.averageMinutes. */
  minutesPerQueue: number;
  bufferMinutes?: number;
};

export function estimateWaitMinutes({
  ahead,
  minutesPerQueue,
  bufferMinutes = 0,
}: EstimateInput) {
  const pending = Math.max(0, Math.trunc(ahead) || 0);
  if (pending === 0) return 0;
  const perQueue = Math.min(
    MAX_MINUTES,
    Math.max(MIN_MINUTES, Math.round(minutesPerQueue) || MIN_MINUTES),
  );
  return pending * perQueue + Math.max(0, Math.trunc(bufferMinutes) || 0);
}