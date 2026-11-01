-- Loket otomatis per layanan + validasi NIK.
-- Service.autoAssignCounter = true membuat nomor dari booking/ambil langsung
-- langsung dipetakan ke loket paling lengang (untuk layanan yang loketnya
-- terpisah ruangan/gedung, flag ini dibiarkan false).
-- Customer.nik menyimpan NIK pelanggan; diwajibkan lewat fitur bisnis NIK.
ALTER TABLE `Service`
  ADD COLUMN `autoAssignCounter` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `Customer`
  ADD COLUMN `nik` VARCHAR(191) NULL;

ALTER TABLE `FeatureConfiguration`
  MODIFY `featureKey` ENUM('QR_QUEUE', 'BOOKING', 'WHATSAPP', 'TV_DISPLAY', 'VOICE_CALL', 'MULTI_COUNTER', 'ANALYTICS', 'ADVERTISEMENT', 'MULTI_BRANCH', 'NIK') NOT NULL;
