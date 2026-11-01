export type CounterLoad = { id: string; waiting: number };

/**
 * Loket dengan antrean menunggu paling sedikit. Seri diputus oleh urutan
 * masukan (stabil) supaya tiket baru menyebar, bukan menumpuk di loket pertama.
 */
export function pickLeastLoadedCounter(
  counters: readonly CounterLoad[],
): string | null {
  let pick: CounterLoad | null = null;
  for (const counter of counters) {
    if (!pick || counter.waiting < pick.waiting) pick = counter;
  }
  return pick?.id ?? null;
}
