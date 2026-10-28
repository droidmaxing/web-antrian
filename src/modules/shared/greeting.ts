/**
 * Salam sapaan mengikuti jam lokal cabang (bukan jam server atau perangkat),
 * supaya "Selamat pagi" tidak muncul saat petugas membuka dashboard malam hari.
 * Waktu datang sebagai ISO dari server agar render pertama dan hidrasi sama.
 */
export function greetingFor(timezone: string, nowIso: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(nowIso)),
  );
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}
