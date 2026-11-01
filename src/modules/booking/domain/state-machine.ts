import { BookingStatus } from "@prisma/client";
import { AppError } from "@/modules/shared/errors";

export type BookingAction = "confirm" | "cancel" | "check-in" | "no-show";

const allowedTransitions: Record<BookingAction, BookingStatus[]> = {
  confirm: [BookingStatus.PENDING],
  cancel: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
  "check-in": [BookingStatus.CONFIRMED],
  // Ditandai petugas setelah pelanggan tidak datang: dipakai untuk membatasi
  // booking online berikutnya dari nomor yang sama (lihat domain/limits.ts).
  "no-show": [BookingStatus.CONFIRMED],
};

export function bookingStatusAfterAction(
  status: BookingStatus,
  action: BookingAction,
) {
  if (!allowedTransitions[action].includes(status)) {
    throw new AppError(
      "Aksi tidak tersedia untuk status booking ini.",
      409,
      "INVALID_BOOKING_TRANSITION",
    );
  }
  if (action === "confirm") return BookingStatus.CONFIRMED;
  if (action === "cancel") return BookingStatus.CANCELLED;
  if (action === "no-show") return BookingStatus.NO_SHOW;
  return BookingStatus.CHECKED_IN;
}
