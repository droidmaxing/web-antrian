/**
 * Buka/tutup pengambilan nomor di lokasi (QR). Aturannya murni supaya bisa diuji
 * tanpa database, dan supaya halaman QR serta API memakai kesimpulan yang sama.
 *
 * AUTO   : ikut jam operasional hari itu, ditutup otomatis `INTAKE_CUTOFF_MINUTES`
 *          sebelum jam tutup supaya nomor tidak menumpuk menjelang tutup.
 * OPEN   : petugas memaksa buka (mis. masih ada pelanggan setelah jam tutup).
 * CLOSED : petugas menutup sementara.
 */
export const INTAKE_CUTOFF_MINUTES = 30;

export type IntakeMode = "AUTO" | "OPEN" | "CLOSED";

export type IntakeHour = {
  weekday: number;
  opensAt: string;
  closesAt: string;
  closed: boolean;
};

export type IntakeState = {
  open: boolean;
  reason: string;
};

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "YYYY-MM-DDTHH:mm" (waktu lokal cabang) → menit sejak tengah malam. */
export function minutesOfDay(localDateTime: string) {
  const time = localDateTime.slice(11, 16);
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new RangeError("localDateTime must be YYYY-MM-DDTHH:mm.");
  }
  return hour * 60 + minute;
}

function parseClock(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new RangeError("Operating hours must use HH:mm format.");
  }
  return hour * 60 + minute;
}

/** Hari lokal ("YYYY-MM-DDTHH:mm") → 0 = Minggu, mengikuti `Date.getUTCDay`. */
export function weekdayOf(localDateTime: string) {
  return new Date(`${localDateTime.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
}

export function intakeState(input: {
  mode: IntakeMode;
  localDateTime: string;
  hours: IntakeHour[];
  cutoffMinutes?: number;
}): IntakeState {
  const { mode, localDateTime, hours, cutoffMinutes = INTAKE_CUTOFF_MINUTES } = input;
  if (mode === "CLOSED") {
    return { open: false, reason: "Ambil nomor di lokasi ditutup sementara oleh petugas." };
  }
  if (mode === "OPEN") {
    return { open: true, reason: "Dibuka oleh petugas di luar jadwal jam operasional." };
  }

  const weekday = weekdayOf(localDateTime);
  const today = hours.find((hour) => hour.weekday === weekday);
  if (!today) {
    // Cabang yang jam operasionalnya belum diisi tidak boleh ikut terkunci.
    return { open: true, reason: "Jam operasional hari ini belum diatur." };
  }
  if (today.closed) {
    return { open: false, reason: `Cabang tutup pada hari ${DAY_NAMES[weekday]}.` };
  }

  const now = minutesOfDay(localDateTime);
  const opensAt = parseClock(today.opensAt);
  const closesAt = parseClock(today.closesAt);
  if (now < opensAt) {
    return { open: false, reason: `Ambil nomor dibuka pukul ${today.opensAt}.` };
  }
  if (now >= closesAt - cutoffMinutes) {
    return {
      open: false,
      reason: `Sudah mendekati jam tutup (${today.closesAt}). Ambil nomor di lokasi dihentikan ${cutoffMinutes} menit sebelum tutup.`,
    };
  }
  return { open: true, reason: `Buka sampai pukul ${today.closesAt}.` };
}
