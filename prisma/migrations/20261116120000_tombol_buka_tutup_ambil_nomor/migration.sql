-- Buka/tutup pengambilan nomor QR per cabang.
-- AUTO = ikut jam operasional (ditutup sendiri mendekati jam tutup),
-- OPEN = dipaksa buka oleh petugas, CLOSED = ditutup sementara oleh petugas.
ALTER TABLE `Branch`
  ADD COLUMN `intakeMode` ENUM('AUTO', 'OPEN', 'CLOSED') NOT NULL DEFAULT 'AUTO';
