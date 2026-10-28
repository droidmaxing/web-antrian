/**
 * Sebuah layar TV yang dipasang di depan satu loket tidak boleh menampilkan
 * (apalagi mengumumkan) panggilan loket lain. Snapshot awal sudah disaring per
 * loket, tetapi aliran event SSE sebelumnya menyaring per cabang saja — jadi
 * setelah halaman termuat, layar loket 01 tetap menerima dan mengumumkan
 * panggilan layanan yang hanya ada di loket 02.
 */
export function isEventVisibleOnDisplay(
  payload: unknown,
  counterIds: string[],
): boolean {
  // Cakupan kosong = layar lobi: semua loket cabang memang miliknya.
  if (!counterIds.length) return true;
  const counterId =
    payload && typeof payload === "object"
      ? (payload as { counterId?: unknown }).counterId
      : undefined;
  // Only counter-bound events (called/recalled/started/…) can leak across
  // screens. `queue.issued` has no counter yet and must pass so the scoped
  // screen's waiting panel refreshes at once — its snapshot is scoped anyway.
  if (counterId === undefined || counterId === null) return true;
  return typeof counterId === "string" && counterIds.includes(counterId);
}
