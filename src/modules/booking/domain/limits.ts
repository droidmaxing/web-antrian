/**
 * Batas booking online untuk menahan nomor palsu: satu pelanggan tidak bisa
 * menyapu banyak slot, dan nomor yang sering tidak hadir ditutup sementara.
 *
 * Cek ini dijalankan di dalam transaksi pembuatan booking, memakai identitas
 * yang sudah ada (nomor telepon → pelanggan per bisnis), jadi tanpa dependensi
 * atau layanan verifikasi baru.
 *
 * ponytail: nomor telepon belum diverifikasi (belum ada OTP/WhatsApp gateway).
 * Kalau penyalahgunaan tetap lolos, tambahkan verifikasi OTP sebelum simpan.
 */
export const MAX_ACTIVE_BOOKINGS_PER_DAY = 2;
export const RECENT_NO_SHOW_LIMIT = 2;
export const NO_SHOW_WINDOW_DAYS = 30;

export type BookingLimitInput = {
  /** Booking aktif untuk layanan + tanggal yang sama. */
  sameServiceSameDay: number;
  /** Semua booking aktif pada tanggal itu (lintas layanan/cabang bisnis ini). */
  activeSameDay: number;
  /** Booking berstatus NO_SHOW dalam `NO_SHOW_WINDOW_DAYS` hari terakhir. */
  recentNoShows: number;
};

export type BookingLimitViolation = { code: string; message: string };

export function bookingLimitViolation(
  input: BookingLimitInput,
): BookingLimitViolation | null {
  if (input.sameServiceSameDay >= 1) {
    return {
      code: "BOOKING_DUPLICATE",
      message: "Layanan ini sudah dipesan untuk tanggal tersebut. Cek tautan status booking Anda.",
    };
  }
  if (input.activeSameDay >= MAX_ACTIVE_BOOKINGS_PER_DAY) {
    return {
      code: "BOOKING_DAILY_LIMIT",
      message: `Nomor ini sudah punya ${MAX_ACTIVE_BOOKINGS_PER_DAY} booking aktif pada tanggal tersebut.`,
    };
  }
  if (input.recentNoShows >= RECENT_NO_SHOW_LIMIT) {
    return {
      code: "BOOKING_NO_SHOW_BLOCKED",
      message: `Nomor ini ${RECENT_NO_SHOW_LIMIT}x tidak hadir dalam ${NO_SHOW_WINDOW_DAYS} hari terakhir, jadi booking online ditutup sementara. Silakan ambil nomor langsung di lokasi.`,
    };
  }
  return null;
}
