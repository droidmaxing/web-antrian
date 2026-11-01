-- Waktu dana dikembalikan Midtrans untuk sebuah pembayaran.
-- Status pembayaran TIDAK diturunkan (dananya memang sudah masuk); kolom ini
-- yang menandai bahwa pengembalian terjadi, supaya laporan tidak kehilangan
-- jejak pembayaran yang pernah lunas.
ALTER TABLE `Payment`
  ADD COLUMN `refundedAt` DATETIME(3) NULL;
