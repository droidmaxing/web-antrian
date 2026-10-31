-- Master Admin managed integration settings; sensitive values are encrypted by the app.
CREATE TABLE `PlatformSetting` (
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
