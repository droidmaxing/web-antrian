-- Tema tampilan per bisnis (warna primer + logo) untuk Superadmin.
CREATE TABLE `BusinessTheme` (
    `businessId` VARCHAR(191) NOT NULL,
    `primaryColor` VARCHAR(7) NOT NULL DEFAULT '#176b5b',
    `logoMimeType` VARCHAR(32) NULL,
    `logoData` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`businessId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BusinessTheme`
    ADD CONSTRAINT `BusinessTheme_businessId_fkey`
    FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
